import { db } from '../db'
import type { Task } from '../models'
import { tracked } from '../saveStatus'
import { taskSchema, validate } from '../schemas'
import { nowISO } from '@/lib/util'
import { compact, stamp, touch } from './base'

export type TaskInput = Pick<Task, 'title' | 'priority'> & Partial<Pick<Task, 'notes' | 'dueDate' | 'trackerId'>>

export async function addTask(input: TaskInput) {
  validate(taskSchema, input)
  return tracked(async () => {
    const row = stamp<Task>(compact({ ...input, title: input.title.trim(), done: false }))
    await db.tasks.add(row)
    return row
  })
}

export async function updateTask(id: string, input: Partial<TaskInput>) {
  if (input.title !== undefined) validate(taskSchema.partial(), input)
  return tracked(async () => {
    await db.tasks.update(id, touch({ ...input, dueDate: input.dueDate || undefined }))
  })
}

export function toggleTask(task: Task) {
  return tracked(async () => {
    await db.tasks.update(task.id, touch({ done: !task.done, doneAt: !task.done ? nowISO() : undefined }))
  })
}

export function deleteTask(id: string) {
  return tracked(() => db.tasks.delete(id))
}

export function clearCompletedTasks() {
  return tracked(async () => {
    const done = await db.tasks.filter((t) => t.done).primaryKeys()
    await db.tasks.bulkDelete(done)
    return done.length
  })
}
