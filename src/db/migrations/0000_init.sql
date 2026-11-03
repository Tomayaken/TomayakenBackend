CREATE TABLE "checkins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"disaster_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"shelter_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"checked_out_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disasters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disasters_status_check" CHECK ("disasters"."status" in ('active', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shelter_beacons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"shelter_id" uuid NOT NULL,
	"major" integer NOT NULL,
	"minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelter_beacons_major_check" CHECK ("shelter_beacons"."major" between 0 and 65535),
	CONSTRAINT "shelter_beacons_minor_check" CHECK ("shelter_beacons"."minor" between 0 and 65535)
);
--> statement-breakpoint
CREATE TABLE "shelter_supplies" (
	"shelter_id" uuid NOT NULL,
	"supply_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelter_supplies_shelter_id_supply_id_pk" PRIMARY KEY("shelter_id","supply_id"),
	CONSTRAINT "shelter_supplies_quantity_check" CHECK ("shelter_supplies"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "shelters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"capacity" integer NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shelters_capacity_check" CHECK ("shelters"."capacity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supplies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"unit" text NOT NULL,
	"consumption_type" text DEFAULT 'daily' NOT NULL,
	"quantity_per_person" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplies_consumption_type_check" CHECK ("supplies"."consumption_type" in ('daily', 'per_person')),
	CONSTRAINT "supplies_quantity_per_person_check" CHECK ("supplies"."quantity_per_person" >= 0)
);
--> statement-breakpoint
CREATE TABLE "supply_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"disaster_id" uuid,
	"shelter_id" uuid NOT NULL,
	"supply_id" uuid NOT NULL,
	"type" text NOT NULL,
	"quantity" integer NOT NULL,
	"operator_name" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supply_transactions_type_check" CHECK ("supply_transactions"."type" in ('IN', 'OUT')),
	CONSTRAINT "supply_transactions_quantity_check" CHECK ("supply_transactions"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "user_location_points" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"speed" double precision,
	"heading" double precision,
	"recorded_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_location_points_latitude_check" CHECK ("user_location_points"."latitude" between -90 and 90),
	CONSTRAINT "user_location_points_longitude_check" CHECK ("user_location_points"."longitude" between -180 and 180),
	CONSTRAINT "user_location_points_accuracy_check" CHECK ("user_location_points"."accuracy" >= 0),
	CONSTRAINT "user_location_points_speed_check" CHECK ("user_location_points"."speed" is null or "user_location_points"."speed" >= 0),
	CONSTRAINT "user_location_points_heading_check" CHECK ("user_location_points"."heading" is null or ("user_location_points"."heading" >= 0 and "user_location_points"."heading" < 360))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_disaster_id_disasters_id_fk" FOREIGN KEY ("disaster_id") REFERENCES "public"."disasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkins" ADD CONSTRAINT "checkins_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelter_beacons" ADD CONSTRAINT "shelter_beacons_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelter_supplies" ADD CONSTRAINT "shelter_supplies_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shelter_supplies" ADD CONSTRAINT "shelter_supplies_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_transactions" ADD CONSTRAINT "supply_transactions_disaster_id_disasters_id_fk" FOREIGN KEY ("disaster_id") REFERENCES "public"."disasters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_transactions" ADD CONSTRAINT "supply_transactions_shelter_id_shelters_id_fk" FOREIGN KEY ("shelter_id") REFERENCES "public"."shelters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_transactions" ADD CONSTRAINT "supply_transactions_supply_id_supplies_id_fk" FOREIGN KEY ("supply_id") REFERENCES "public"."supplies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_location_points" ADD CONSTRAINT "user_location_points_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_single_active_per_user_idx" ON "checkins" USING btree ("user_id") WHERE "checkins"."checked_out_at" is null;--> statement-breakpoint
CREATE INDEX "checkins_active_by_shelter_idx" ON "checkins" USING btree ("shelter_id") WHERE "checkins"."checked_out_at" is null;--> statement-breakpoint
CREATE INDEX "checkins_disaster_id_idx" ON "checkins" USING btree ("disaster_id");--> statement-breakpoint
CREATE UNIQUE INDEX "disasters_single_active_idx" ON "disasters" USING btree ("status") WHERE "disasters"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "shelter_beacons_major_minor_idx" ON "shelter_beacons" USING btree ("major","minor");--> statement-breakpoint
CREATE INDEX "shelter_beacons_shelter_id_idx" ON "shelter_beacons" USING btree ("shelter_id");--> statement-breakpoint
CREATE INDEX "supply_transactions_shelter_created_idx" ON "supply_transactions" USING btree ("shelter_id","created_at");--> statement-breakpoint
CREATE INDEX "user_location_points_user_recorded_idx" ON "user_location_points" USING btree ("user_id","recorded_at");--> statement-breakpoint
CREATE INDEX "users_household_id_idx" ON "users" USING btree ("household_id");