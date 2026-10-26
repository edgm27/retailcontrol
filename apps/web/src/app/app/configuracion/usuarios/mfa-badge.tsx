import type { MemberRow } from "@rc/domain";
import { Badge } from "@rc/ui";

export function MfaBadge({ m }: { m: MemberRow }) {
  if (m.mfaEnrolled) return <Badge variant="success">Activa</Badge>;
  if (m.mfaRequired || m.mfaRequiredByPolicy) return <Badge variant="warning">Pendiente de vincular</Badge>;
  return <Badge variant="secondary">Inactiva</Badge>;
}
