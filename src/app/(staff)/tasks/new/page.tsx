import { PageHeader } from "@/components/ui";
import { TaskForm } from "@/components/task-form";
import { createTaskAction } from "../../actions";

export const metadata = { title: "Новый квест" };

export default function NewTaskPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Новый квест"
        subtitle="Опубликуй сразу — карточка улетит в чат отдела с кнопкой «Беру». Или сохрани черновиком."
      />
      <TaskForm mode="create" action={createTaskAction} values={{ kind: "CONTENT", points: 10 }} />
    </div>
  );
}
