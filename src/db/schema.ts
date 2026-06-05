import { pgTable, serial, integer, timestamp, doublePrecision, uniqueIndex } from "drizzle-orm/pg-core"

export const carState = pgTable(
	"car_state",
	{
		id: serial().primaryKey(),
		carId: integer("car_id"),
		time: timestamp(),
		stateOfCharge: integer("state_of_charge"),
		latitude: doublePrecision(),
		longitude: doublePrecision(),
		gear: integer(),
		speed: doublePrecision(),
	},
	(table) => [uniqueIndex("car_state_car_id_time_idx").on(table.carId, table.time)],
);
