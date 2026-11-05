/*
  Warnings:

  - You are about to drop the column `skill` on the `Task` table. All the data in the column will be lost.
  - You are about to drop the column `skill` on the `TaskTemplate` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Task" DROP COLUMN "skill",
ADD COLUMN     "skills" "Skill"[];

-- AlterTable
ALTER TABLE "TaskTemplate" DROP COLUMN "skill",
ADD COLUMN     "skills" "Skill"[];
