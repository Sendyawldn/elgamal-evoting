import { AdminPanel } from "@/features/voting/components/admin-panel"
import { election } from "@/features/voting/election-data"

export default function AdminPage() {
  return <AdminPanel election={election} />
}
