CREATE TABLE "User" (
  "id" SERIAL PRIMARY KEY,
  "username" VARCHAR(24) NOT NULL UNIQUE,
  "displayName" VARCHAR(50) NOT NULL,
  "bio" VARCHAR(160) NOT NULL DEFAULT '',
  "passwordHash" TEXT NOT NULL
);
CREATE TABLE "Conversation" (
  "id" SERIAL PRIMARY KEY,
  "firstId" INTEGER NOT NULL REFERENCES "User"("id"),
  "secondId" INTEGER NOT NULL REFERENCES "User"("id"),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_ordered_pair" CHECK ("firstId" < "secondId")
);
CREATE UNIQUE INDEX "Conversation_firstId_secondId_key" ON "Conversation"("firstId", "secondId");
CREATE INDEX "Conversation_firstId_updatedAt_id_idx" ON "Conversation"("firstId", "updatedAt", "id");
CREATE INDEX "Conversation_secondId_updatedAt_id_idx" ON "Conversation"("secondId", "updatedAt", "id");
CREATE TABLE "Message" (
  "id" SERIAL PRIMARY KEY,
  "conversationId" INTEGER NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE,
  "senderId" INTEGER NOT NULL REFERENCES "User"("id"),
  "text" VARCHAR(4000) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "Message_conversationId_id_idx" ON "Message"("conversationId", "id");
CREATE TABLE "session" (
  "sid" VARCHAR NOT NULL PRIMARY KEY,
  "sess" JSON NOT NULL,
  "expire" TIMESTAMP(6) NOT NULL
);
CREATE INDEX "IDX_session_expire" ON "session" ("expire");
