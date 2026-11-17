ALTER TABLE "shelter_beacons" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "shelter_beacons" CASCADE;--> statement-breakpoint
ALTER TABLE "shelters" ALTER COLUMN "latitude" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ALTER COLUMN "longitude" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_latitude_check" CHECK ("shelters"."latitude" between -90 and 90);--> statement-breakpoint
ALTER TABLE "shelters" ADD CONSTRAINT "shelters_longitude_check" CHECK ("shelters"."longitude" between -180 and 180);