import { useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Category, TxType } from '@/data/models'
import { useCategories, useTransactions } from '@/data/hooks'
import { addCategory, deleteCategory, updateCategory } from '@/data/repos/spending'
import { COLOR_CHOICES } from '@/data/defaults'
import { Button } from '@/components/ui/Button'
import { Badge, Card, CardHeader, Loading, Segmented } from '@/components/ui/display'
import { Field, LabeledInput } from '@/components/ui/forms'
import { Modal } from '@/components/ui/Modal'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useSubmit } from '@/components/useSubmit'
import { cn } from '@/lib/util'

export function CategoriesPage() {
  const categories = useCategories()
  const txs = useTransactions()
  const confirm = useConfirm()
  const toast = useToast()
  const [type, setType] = useState<TxType>('expense')
  const [editing, setEditing] = useState<Category | null | undefined>(undefined)
  if (!categories || !txs) return <Loading />
  const list = categories.filter((c) => c.type === type)
  const usage = (c: Category) => txs.filter((t) => t.category === c.name && t.type === c.type).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented value={type} onChange={setType} options={[{ value: 'expense', label: 'Expense categories' }, { value: 'income', label: 'Income categories' }]} />
        <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setEditing(null)}>
          New category
        </Button>
      </div>
      <Card>
        <CardHeader title={`${list.length} ${type} categories`} subtitle="Renaming a category updates its transactions, budgets and recurring schedules." />
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id} className={cn('flex flex-wrap items-center gap-3 px-5 py-3', c.archived && 'opacity-60')}>
              <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">
                  {c.name} {c.archived && <Badge>Archived</Badge>}
                </p>
                <p className="text-xs text-muted">
                  {usage(c)} transactions{c.subcategories.length ? ` · ${c.subcategories.join(', ')}` : ''}
                </p>
              </div>
              <Button size="icon-sm" variant="ghost" aria-label="Edit category" onClick={() => setEditing(c)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon-sm" variant="ghost" aria-label={c.archived ? 'Restore category' : 'Archive category'} onClick={() => updateCategory(c.id, { archived: !c.archived }).then(() => toast.success(c.archived ? 'Category restored' : 'Category archived')).catch(toast.error)}>
                {c.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Delete category"
                onClick={async () => {
                  if (await confirm({ title: `Delete “${c.name}”?`, message: 'Its budgets are removed too. Categories in use cannot be deleted — archive them instead.', confirmLabel: 'Delete', danger: true })) deleteCategory(c.id).then(() => toast.success('Category deleted')).catch(toast.error)
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit category' : 'New category'} size="sm">
        {editing !== undefined && <CategoryForm category={editing ?? undefined} type={type} onDone={() => setEditing(undefined)} />}
      </Modal>
    </div>
  )
}

function CategoryForm({ category, type, onDone }: { category?: Category; type: TxType; onDone: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState(category?.color ?? COLOR_CHOICES[0])
  const [subs, setSubs] = useState((category?.subcategories ?? []).join(', '))
  const { busy, run } = useSubmit()
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const subcategories = subs.split(',').map((s) => s.trim()).filter(Boolean)
    const ok = await run(() => (category ? updateCategory(category.id, { name, color, subcategories }) : addCategory({ name, color, type, subcategories })), category ? 'Category saved' : 'Category added')
    if (ok) onDone()
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <LabeledInput label="Name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <Field label="Color">
        <div className="flex flex-wrap gap-2">
          {COLOR_CHOICES.map((c) => (
            <button type="button" key={c} aria-label={`Color ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full ring-offset-2 ring-offset-[var(--surface)]', color === c && 'ring-2 ring-fg')} style={{ background: c }} />
          ))}
        </div>
      </Field>
      <LabeledInput label="Subcategories" value={subs} onChange={(e) => setSubs(e.target.value)} placeholder="Comma separated" />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </div>
    </form>
  )
}
