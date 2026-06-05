# Implementation notes

Dva procesy:
 - `collector` čte MQTT, drží stav auta v paměti a každých 5s pošle snapshot do rabbitu
 - `writer` to konzumuje a zapisuje do postgresu. Rabbit je mezi nima buffer, takže se data neztratí, když writer/DB chvíli nejedou. Ticky zarovnávám na celé 5s hranice, ať mi drift neposouvá timestampy – drift je postupné nahromadění malých zpoždění (`setInterval`/`setTimeout` nikdy netrefí přesně 5000 ms, takže se chyby sčítají), kterému se vyhýbám tím, že každý tick počítám od absolutní wall-clock hranice, ne od předchozího ticku.

## design principles

Abstrakce:
 - **`contracts/`** říkají *co* potřebuju (publish/consume `Snapshot`, `insert` do DB),
 - **`adapters/`** to napojí na Rabbit a Drizzle. `collector` a `writer` jsou jen composition root

Doména auta je v `car/`. Entrypointy nevidí `Buffer` ani `amqplib`; JSON na frontě řeší Rabbit adaptér přes `codec`. MQTT zůstalo přímo v collectoru, nechtěl jsem na to další abstrakci.

## error handling

Tady jsem strávil nejvíc času. Rabbit se reconnectuje s backoffem, dokud není kanál, snapshoty zahazuju a loguju (radši ztratit tick než spadnout). Publikuju přes confirm channel, takže vím, že je zpráva safe. Na writeru jdou transientní chyby přes retry (delay queue → zpět) a po pár pokusech do DLQ; neparsovatelné rovnou do DLQ. Insert je idempotentní (`onConflictDoNothing`), takže redelivery nedělá duplicity. Shutdown dočeká rozpracované zprávy a pak zavře.

## v produkci

- Auto-restart po crashi (teď jen spadne) – nechal bych na orchestrátoru.
- Teď je to na jedno auto; pro víc aut `Map<carId, CarState>` a škálovat horizontálně.
- Postgres: batch insert (s vyšším prefetchem) místo insert na zprávu.
- DLQ: alerting + replay.

### škálování na 1M+ aut

- **Partitioning by carId**: hashnout `carId` na N shardů, každý shard = vlastní topic/partition + skupina konzumentů. Stav jednoho auta řeší vždy jen jedna instance, takže `Map<carId, CarState>` zůstává konzistentní bez zámků.
- **Stav mimo proces**: per-instance paměť nahradit Redisem, ať rebalancing/restart neztratí rozpracovaný stav.
- **Backpressure & autoscaling**: škálovat konzumenty podle hloubky fronty, snapshoty samplovat/agregovat dřív, ať se nezahltí DB. S AI jsem si ověřil, že by se to řešilo skrz KEDA. Writer je stateless + insert idempotentní, takže scale up/down je zadarmo.
- **Postgres**: tady je vždycky finální hrdlo. Možné optimalizace:
  - insert/zpráva (co mám teď) ~1–3k/s, limit je fsync per commit
  - batch insert ~10–80k/s podle železa – největší výhra za nejmíň práce, dělám první
  - `COPY` ~100–300k/s, ale blbě se snáší s dedupem (přes staging)
  - jeden velký node (~64 vCPU, NVMe Gen5) je strop ~300–500k/s
  - Timescale (hypertable po čase) na jednom L nodu ~500k–1M/s → pokryje modelových ~200k/s (1M aut / 5s) s rezervou, tady bych se zastavil
  - sharding (Citus / app-level po carId) až kdyby to nestačilo, pak lineárně N× node
