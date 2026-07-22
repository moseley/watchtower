-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'expo',
ADD COLUMN     "webPushEndpoint" TEXT,
ADD COLUMN     "webPushSubscription" JSONB,
ALTER COLUMN "expoPushToken" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Device_webPushEndpoint_key" ON "Device"("webPushEndpoint");
