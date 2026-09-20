"use client";

import { AnimatePresence, motion } from "framer-motion";
import { KeyRound, Mail, Pencil, Phone, Plus, ShieldCheck, Trash2, UserCog, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

import { PageHeader, useUser } from "@/components/app-shell";
import { AccountDialog, ConfirmDelete, CounselorDialog, PasswordResetDialog } from "@/components/dialogs";
import { EmptyState, Monogram, SearchField, Segmented, SOFT_SPRING } from "@/components/mac/controls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatDate, ROLE_LABELS, useApi, type Account, type Counselor, type Role } from "@/lib/api";
import { cn } from "cn";

const ROLE_TONE: Record<Role, string> = {
  admin: "bg-violet-500/14 text-violet-600 dark:text-violet-300",
  lecturer: "bg-sky-500/14 text-sky-600 dark:text-sky-300",
  student: "bg-emerald-500/14 text-emerald-600 dark:text-emerald-300",
};

function AdminPage() {
  const user = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const [section, setSection] = useState<"accounts" | "counselors">(params.get("tab") === "counselors" ? "counselors" : "accounts");

  useEffect(() => {
    if (user.role !== "admin") router.replace("/");
  }, [user, router]);
  if (user.role !== "admin") return null;

  return (
    <>
      <PageHeader
        icon={<span className="grid size-14 place-items-center rounded-[18px] bg-gradient-to-b from-slate-400 to-slate-700 text-white shadow-lg"><ShieldCheck className="size-7" /></span>}
        title="Quản trị"
        description="Tài khoản đăng nhập, phân quyền và cán bộ tư vấn."
      />
      <Segmented value={section} onChange={setSection} className="mb-5"
                 options={[{ value: "accounts", label: "Tài khoản", icon: UserCog }, { value: "counselors", label: "Cán bộ tư vấn", icon: Users }]} />
      <AnimatePresence mode="wait">
        <motion.div key={section} initial={{ opacity: 0, x: section === "accounts" ? -16 : 16 }} animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }} transition={SOFT_SPRING}>
          {section === "accounts" ? <Accounts me={user.user_id} openCreate={params.get("new") === "1"} /> : <Counselors />}
        </motion.div>
      </AnimatePresence>
    </>
  );
}

function Accounts({ me, openCreate }: { me: number; openCreate: boolean }) {
  const [keyword, setKeyword] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<"" | Role>("");
  const [creating, setCreating] = useState(openCreate);
  const [editing, setEditing] = useState<Account | null>(null);
  const [resetting, setResetting] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const { data, mutate } = useApi<Account[]>(`/users?${new URLSearchParams({ keyword: search, role })}`, { keepPreviousData: true });

  async function toggleActive(account: Account, active: boolean) {
    // Cập nhật lạc quan: công tắc gạt ngay, lỗi thì trả về như cũ.
    mutate(data?.map((a) => (a.user_id === account.user_id ? { ...a, is_active: active } : a)), { revalidate: false });
    try {
      await api(`/users/${account.user_id}`, {
        method: "PUT",
        json: { username: account.username, full_name: account.full_name, email: account.email, role: account.role,
                student_id: account.student_id, is_active: active, password: null },
      });
      toast.success(active ? `Đã mở khoá @${account.username}` : `Đã khoá @${account.username}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
    mutate();
  }

  const counts = data?.reduce((acc, a) => ({ ...acc, [a.role]: (acc[a.role] ?? 0) + 1 }), {} as Partial<Record<Role, number>>);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={role} onChange={setRole}
                   options={[{ value: "", label: "Tất cả" }, ...(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({
                     value: r, label: <>{ROLE_LABELS[r]}{!role && counts?.[r] != null && <span className="opacity-50">{counts[r]}</span>}</>,
                   }))]} />
        <div className="flex-1" />
        <SearchField value={keyword} onChange={setKeyword} placeholder="Tên, tên đăng nhập, email" className="w-full sm:w-64" />
        <Button onClick={() => setCreating(true)}><Plus /> Tạo tài khoản</Button>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Người dùng</TableHead>
                <TableHead>Vai trò</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Phạm vi</TableHead>
                <TableHead className="hidden sm:table-cell">Tạo ngày</TableHead>
                <TableHead>Đăng nhập</TableHead>
                <TableHead className="w-24 pr-5" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {!data && [...Array(6)].map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7} className="px-5"><Skeleton className="h-9 rounded-xl" /></TableCell></TableRow>
              ))}
              {data?.map((account, index) => (
                <ContextMenu key={account.user_id}>
                  <ContextMenuTrigger asChild>
                    <motion.tr data-slot="table-row" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                               transition={{ ...SOFT_SPRING, delay: Math.min(index, 15) * 0.02 }}
                               className={cn("group border-b border-border/60 transition-colors last:border-0 hover:bg-muted/60",
                                 !account.is_active && "opacity-55")}>
                      <TableCell className="pl-5">
                        <div className="flex items-center gap-3">
                          <Monogram name={account.full_name} className="size-8 text-xs" />
                          <div>
                            <div className="font-medium">{account.full_name}{account.user_id === me && <span className="ml-1.5 text-xs text-muted-foreground">(bạn)</span>}</div>
                            <div className="text-xs text-muted-foreground">@{account.username}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ROLE_TONE[account.role])}>{ROLE_LABELS[account.role]}</span>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground md:table-cell">{account.email ?? "—"}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                        {account.role === "admin" ? "Toàn hệ thống"
                          : account.role === "lecturer" ? `${account.advisees} sinh viên`
                            : account.student_code ?? "—"}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{formatDate(account.created_at)}</TableCell>
                      <TableCell>
                        <Switch checked={account.is_active} disabled={account.user_id === me}
                                onCheckedChange={(checked) => toggleActive(account, checked)}
                                aria-label={account.is_active ? "Khoá tài khoản" : "Mở khoá tài khoản"} />
                      </TableCell>
                      <TableCell className="pr-5">
                        <span className="flex justify-end gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                          <IconButton label="Sửa" onClick={() => setEditing(account)}><Pencil /></IconButton>
                          <IconButton label="Đặt lại mật khẩu" onClick={() => setResetting(account)}><KeyRound /></IconButton>
                          {account.user_id !== me && <IconButton label="Xoá" destructive onClick={() => setDeleting(account)}><Trash2 /></IconButton>}
                        </span>
                      </TableCell>
                    </motion.tr>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuLabel>@{account.username}</ContextMenuLabel>
                    <ContextMenuItem onSelect={() => setEditing(account)}><Pencil />Sửa tài khoản…</ContextMenuItem>
                    <ContextMenuItem onSelect={() => setResetting(account)}><KeyRound />Đặt lại mật khẩu…</ContextMenuItem>
                    {account.user_id !== me && (
                      <>
                        <ContextMenuItem onSelect={() => toggleActive(account, !account.is_active)}>
                          {account.is_active ? "Khoá đăng nhập" : "Mở khoá đăng nhập"}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem variant="destructive" onSelect={() => setDeleting(account)}><Trash2 />Xoá tài khoản…</ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>
              ))}
            </TableBody>
          </Table>
        </div>
        {data && !data.length && <EmptyState icon={UserCog} title="Không có tài khoản nào khớp" />}
      </Card>

      <AccountDialog open={creating} onOpenChange={setCreating} onSaved={() => mutate()} />
      {editing && (
        <AccountDialog key={editing.user_id} account={editing} open onOpenChange={(o) => !o && setEditing(null)} onSaved={() => mutate()} />
      )}
      {resetting && (
        <PasswordResetDialog key={resetting.user_id} account={resetting} open onOpenChange={(o) => !o && setResetting(null)} />
      )}
      <ConfirmDelete
        open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={`Xoá tài khoản @${deleting?.username ?? ""}?`}
        description={deleting?.role === "lecturer" && deleting.advisees
          ? `${deleting.advisees} sinh viên đang do người này phụ trách sẽ trở về trạng thái chưa gán giảng viên.`
          : "Người dùng sẽ không đăng nhập được nữa. Dữ liệu sinh viên không bị ảnh hưởng."}
        confirmLabel="Xoá tài khoản"
        onConfirm={async () => {
          await api(`/users/${deleting!.user_id}`, { method: "DELETE" });
          toast.success(`Đã xoá @${deleting!.username}`);
          mutate();
        }}
      />
    </>
  );
}

function Counselors() {
  const { data, mutate } = useApi<Counselor[]>("/counselors");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Counselor | null>(null);
  const [deleting, setDeleting] = useState<Counselor | null>(null);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{data ? `${data.length} cán bộ` : " "}</p>
        <Button onClick={() => setCreating(true)}><Plus /> Thêm cán bộ</Button>
      </div>

      {!data ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-[22px]" />)}</div>
      ) : !data.length ? (
        <Card><EmptyState icon={Users} title="Chưa có cán bộ tư vấn" description="Thêm cán bộ để gán cho buổi gặp và việc can thiệp."
                          action={<Button onClick={() => setCreating(true)}><Plus /> Thêm cán bộ</Button>} /></Card>
      ) : (
        <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {data.map((c, i) => (
              <motion.div key={c.counselor_id} layout initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }} transition={{ ...SOFT_SPRING, delay: i * 0.03 }}>
                <Card className="group h-full">
                  <div className="flex items-start gap-3 px-5">
                    <Monogram name={c.full_name} className="size-12 text-lg" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{c.full_name}</div>
                      <div className="truncate text-sm text-muted-foreground">{c.title ?? "Cán bộ tư vấn"}</div>
                    </div>
                    <span className="flex gap-0.5 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <IconButton label="Sửa" onClick={() => setEditing(c)}><Pencil /></IconButton>
                      <IconButton label="Xoá" destructive onClick={() => setDeleting(c)}><Trash2 /></IconButton>
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 px-5 text-xs">
                    {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70"><Mail className="size-3" />{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 hover:bg-muted/70"><Phone className="size-3" />{c.phone}</a>}
                    {!c.email && !c.phone && <span className="text-muted-foreground">Chưa có thông tin liên hệ</span>}
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      <CounselorDialog open={creating} onOpenChange={setCreating} onSaved={() => mutate()} />
      {editing && (
        <CounselorDialog key={editing.counselor_id} counselor={editing} open onOpenChange={(o) => !o && setEditing(null)} onSaved={() => mutate()} />
      )}
      <ConfirmDelete
        open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}
        title={`Xoá ${deleting?.full_name ?? ""}?`}
        description="Buổi gặp và việc can thiệp do cán bộ này phụ trách vẫn được giữ, chỉ bỏ tên người phụ trách."
        onConfirm={async () => {
          await api(`/counselors/${deleting!.counselor_id}`, { method: "DELETE" });
          toast.success(`Đã xoá ${deleting!.full_name}`);
          mutate();
        }}
      />
    </>
  );
}

function IconButton({ label, onClick, destructive, children }: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick}
            className={cn("grid size-7 place-items-center rounded-full text-muted-foreground [&_svg]:size-3.5",
              destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-muted hover:text-foreground")}>
      {children}
    </button>
  );
}

export default function Page() {
  return <Suspense><AdminPage /></Suspense>;
}
