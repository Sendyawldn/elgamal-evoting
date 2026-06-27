"use client";

import { useState } from "react";
import {
  KeyRound,
  LockKeyhole,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Square,
  Trash2,
  UserCheck,
  BarChart2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Candidate, Election, ElectionStatus } from "../types";
import {
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  ADMIN_HEADERS,
} from "@/lib/api-client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
type AdminPanelProps = {
  election: Election;
};

const adminEmail = "admin@kampus.test";
const adminPassword = "admin123";

export function AdminPanel({ election }: AdminPanelProps) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState(adminEmail);
  const [password, setPassword] = useState("");
  const [loginMessage, setLoginMessage] = useState(
    "Login admin diperlukan untuk membuka kontrol penuh.",
  );
  const [managedElection, setManagedElection] = useState(election);
  const [history, setHistory] = useState<Election[]>([]);
  const [candidateDraft, setCandidateDraft] = useState({
    name: "",
    party: "",
    platform: "",
  });
  const [voterIdentifierDraft, setVoterIdentifierDraft] = useState("");
  const [voterMessage, setVoterMessage] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [adminMessage, setAdminMessage] = useState(
    "Admin memiliki full access atas konfigurasi demo.",
  );
  const [finalTally, setFinalTally] = useState<Record<string, number> | null>(
    null,
  );
  const [aggregationLogs, setAggregationLogs] = useState<string[]>([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [viewedHistoryId, setViewedHistoryId] = useState<string | null>(null);

  const hasConfiguredElection = Boolean(
    managedElection.title.trim() &&
    managedElection.description.trim() &&
    managedElection.region.trim() &&
    managedElection.candidates.length >= 2 &&
    managedElection.authorizedVoters.length > 0,
  );
  const hasVotingSession =
    managedElection.status !== "draft" || managedElection.ballotsCast > 0;

  async function loadElectionState() {
    try {
      const body = await apiGet<{ election: Election; history: Election[] }>(
        "/api/admin/election",
        { headers: ADMIN_HEADERS },
      );
      setManagedElection(body.election);
      setHistory(body.history ?? []);
    } catch (err) {
      // Handle error
    }
  }

  function login() {
    if (
      loginEmail.trim().toLowerCase() === adminEmail &&
      password === adminPassword
    ) {
      setIsLoggedIn(true);
      setLoginMessage("Login berhasil. Admin panel terbuka.");
      loadElectionState();
      return;
    }

    setLoginMessage("Email atau password admin salah.");
  }

  async function updateElectionStatus(status: ElectionStatus) {
    if (status === "open" && !hasConfiguredElection) {
      setAdminMessage(
        "Isi identitas pemilihan, minimal dua kandidat, dan DPT sebelum membuka pemilihan.",
      );
      return;
    }

    if (status === "closed" && !hasVotingSession) {
      setAdminMessage("Belum ada sesi vote. Mulai pemilihan terlebih dahulu.");
      return;
    }

    const nextElection = { ...managedElection, status };
    setManagedElection(nextElection);
    setAdminMessage(
      status === "open"
        ? "Pemilihan dibuka dan sesi aktif tersimpan. Halaman pemilih sudah bisa melihat kandidat."
        : status === "closed"
          ? "Pemilihan selesai. Admin dapat mendekripsi hasil akhir."
          : "Pemilihan dikembalikan ke draft untuk pengaturan.",
    );

    await persistElectionState(nextElection);
  }

  function addCandidate() {
    if (managedElection.status !== "draft") {
      setCandidateMessage(
        "Kandidat tidak bisa ditambahkan setelah pemilihan dimulai.",
      );
      return;
    }

    if (!candidateDraft.name.trim() || !candidateDraft.party.trim()) {
      setCandidateMessage("Nama dan kelompok kandidat wajib diisi.");
      return;
    }

    const normalizedName = candidateDraft.name.trim().toLowerCase();
    const normalizedParty = candidateDraft.party.trim().toLowerCase();

    const candidateExists = managedElection.candidates.some(
      (c) =>
        c.name.toLowerCase() === normalizedName &&
        c.party.toLowerCase() === normalizedParty,
    );

    if (candidateExists) {
      setCandidateMessage(
        "Kandidat dengan kombinasi nama dan kelompok ini sudah ada.",
      );
      return;
    }

    const uniqueId =
      "KAND-" + Math.random().toString(36).substring(2, 7).toUpperCase();

    const nextCandidate: Candidate = {
      id: uniqueId,
      name: candidateDraft.name.trim(),
      party: candidateDraft.party.trim(),
      platform: candidateDraft.platform.trim() || "Platform belum diisi admin.",
      color: `var(--chart-${(managedElection.candidates.length % 4) + 1})`,
      votes: 0,
    };

    setManagedElection((current) => ({
      ...current,
      candidates: [...current.candidates, nextCandidate],
    }));
    setCandidateDraft({ name: "", party: "", platform: "" });
    setCandidateMessage("");
  }

  function removeCandidate(candidateId: string) {
    if (managedElection.status !== "draft") {
      setAdminMessage("Kandidat tidak bisa dihapus setelah pemilihan dimulai.");
      return;
    }

    setManagedElection((current) => ({
      ...current,
      candidates: current.candidates.filter(
        (candidate) => candidate.id !== candidateId,
      ),
    }));
    setAdminMessage("Kandidat dihapus dari konfigurasi admin.");
  }

  function addVoterIdentifier() {
    if (managedElection.status !== "draft") {
      setVoterMessage("DPT tidak bisa ditambahkan setelah pemilihan dimulai.");
      return;
    }

    if (!voterIdentifierDraft.trim()) {
      setVoterMessage("Masukkan nama pemilih.");
      return;
    }

    const name = voterIdentifierDraft.trim();
    const normalizedName = name.toLowerCase();
    const alreadyExists = managedElection.authorizedVoters.some(
      (voter) => voter.name?.toLowerCase() === normalizedName,
    );

    if (alreadyExists) {
      setVoterMessage("Pemilih dengan nama ini sudah ada.");
      return;
    }

    const token = Math.random().toString(36).substring(2, 8).toUpperCase();

    setManagedElection((current) => ({
      ...current,
      totalVoters: current.totalVoters + 1,
      authorizedVoters: [
        ...current.authorizedVoters,
        {
          id: token.toLowerCase(),
          email: `${token.toLowerCase()}@local.voter`,
          identifier: token,
          name: name,
          hasVoted: false,
        },
      ],
    }));
    setVoterIdentifierDraft("");
    setVoterMessage("");
  }

  function removeVoterIdentifier(voterId: string) {
    if (managedElection.status !== "draft") {
      setVoterMessage("DPT tidak bisa dihapus setelah pemilihan dimulai.");
      return;
    }

    setManagedElection((current) => ({
      ...current,
      totalVoters: current.totalVoters - 1,
      authorizedVoters: current.authorizedVoters.filter(
        (voter) => voter.id !== voterId,
      ),
    }));
    setVoterMessage("");
  }

  async function persistElectionState(electionToSave: Election) {
    try {
      const body = await apiPut<{ history?: Election[]; persistence?: string }>(
        "/api/admin/election",
        electionToSave,
        ADMIN_HEADERS,
      );
      setHistory(body.history ?? []);
      setAdminMessage(`State admin disimpan ke ${body.persistence}.`);
    } catch (err: any) {
      setAdminMessage(err.message ?? "Gagal menyimpan state admin.");
    }
  }

  async function deleteHistory(historyId: string) {
    try {
      const body = await apiDelete<{ history?: Election[] }>(
        `/api/admin/election/history/${historyId}`,
        ADMIN_HEADERS,
      );
      setHistory(body.history ?? []);
      setAdminMessage("Sesi riwayat berhasil dihapus.");
    } catch (err: any) {
      setAdminMessage(err.message ?? "Gagal menghapus riwayat.");
    }
  }

  async function syncAdminState() {
    try {
      const body = await apiPost<{
        election: Election;
        history?: Election[];
        persistence?: string;
      }>("/api/admin/election", managedElection, ADMIN_HEADERS);
      setManagedElection(body.election);
      setHistory(body.history ?? []);
      setFinalTally(null);
      setAdminMessage(
        `Sesi tersimpan ke riwayat ${body.persistence}. Form dikosongkan untuk sesi baru.`,
      );
    } catch (err: any) {
      setAdminMessage(err.message ?? "Gagal mengarsipkan sesi.");
    }
  }

  async function decryptFinalTally() {
    if (managedElection.status !== "closed") {
      setAdminMessage(
        "Tutup pemilihan sebelum menjalankan agregasi dan dekripsi.",
      );
      return;
    }

    setIsDecrypting(true);
    setAggregationLogs([
      "Menghubungi ledger terenkripsi...",
      "Menyiapkan operasi homomorphic...",
    ]);

    try {
      const body = await apiGet<{
        tally: Record<string, number>;
        logs?: string[];
        ledgerSize?: number;
      }>("/api/admin/tally", { headers: ADMIN_HEADERS });
      setFinalTally(body.tally);
      setAggregationLogs(body.logs ?? []);
      setAdminMessage(
        `Agregasi selesai dari ${body.ledgerSize} receipt terenkripsi.`,
      );
      setIsDecrypting(false);
    } catch (err: any) {
      setAdminMessage(err.message ?? "Gagal menjalankan dekripsi tally.");
      setAggregationLogs([]);
      setIsDecrypting(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-8">
        <Card className="seal-panel w-full border-primary/20">
          <CardHeader>
            <Badge variant="secondary" className="mb-2 w-fit gap-2">
              <LockKeyhole className="size-3.5" aria-hidden="true" />
              /admin
            </Badge>
            <CardTitle className="text-3xl font-black">Login Admin</CardTitle>
            <CardDescription>
              Masuk untuk mengelola kandidat, status pemilihan, dan dekripsi
              hasil akhir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-2 text-sm font-medium">
              Email admin
              <input
                className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <input
                className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="admin123"
              />
            </label>
            <Button type="button" className="w-full" onClick={login}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              Masuk Admin
            </Button>
            <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              {loginMessage}
            </p>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header className="counting-table rounded-lg border p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge variant="verified" className="mb-4 gap-2">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Admin authorized
            </Badge>
            <h1 className="text-4xl font-black sm:text-6xl">Admin Evoting</h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              Full access untuk mengatur kandidat, status pemilihan, monitoring
              pemilih, dan dekripsi hasil.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => updateElectionStatus("open")}
              disabled={
                managedElection.status !== "draft" || !hasConfiguredElection
              }
            >
              <Play className="size-4" aria-hidden="true" />
              Mulai Pemilihan
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => updateElectionStatus("closed")}
              disabled={!hasVotingSession || managedElection.status !== "open"}
            >
              <Square className="size-4" aria-hidden="true" />
              Tutup Pemilihan
            </Button>
            <Button
              type="button"
              onClick={syncAdminState}
              disabled={managedElection.status !== "closed"}
            >
              <UserCheck className="size-4" aria-hidden="true" />
              Simpan State
            </Button>
          </div>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Identitas Pemilihan</CardTitle>
          <CardDescription>
            Data ini kosong di awal dan harus diisi admin sebelum pemilihan
            dibuka.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Judul <span className="text-destructive">*</span>
            </span>
            <input
              className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={managedElection.title}
              onChange={(event) =>
                setManagedElection((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Judul pemilihan"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            <span>
              Organisasi / Instansi <span className="text-destructive">*</span>
            </span>
            <input
              className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={managedElection.region}
              onChange={(event) =>
                setManagedElection((current) => ({
                  ...current,
                  region: event.target.value,
                }))
              }
              placeholder="Nama kampus/organisasi"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium md:col-span-3">
            <span>
              Deskripsi <span className="text-destructive">*</span>
            </span>
            <textarea
              className="min-h-20 rounded-md border bg-background p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={managedElection.description}
              onChange={(event) =>
                setManagedElection((current) => ({
                  ...current,
                  description: event.target.value,
                }))
              }
              placeholder="Deskripsi pemilihan"
            />
          </label>
        </CardContent>
      </Card>

      <section className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="size-5 text-primary" aria-hidden="true" />
              Manajemen Kandidat
            </CardTitle>
            <CardDescription>
              Admin bisa menambah atau menghapus kandidat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <input
                className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Nama kandidat *"
                value={candidateDraft.name}
                onChange={(event) =>
                  setCandidateDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
              <input
                className="h-11 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Kelompok atau partai *"
                value={candidateDraft.party}
                onChange={(event) =>
                  setCandidateDraft((current) => ({
                    ...current,
                    party: event.target.value,
                  }))
                }
              />

              <Button
                type="button"
                variant="secondary"
                onClick={addCandidate}
                disabled={managedElection.status !== "draft"}
              >
                <Plus className="size-4" aria-hidden="true" />
                Tambah Kandidat
              </Button>
              {!managedElection.candidates.some((c) => c.id === "abstain") && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setManagedElection((current) => ({
                      ...current,
                      candidates: [
                        ...current.candidates,
                        {
                          id: "abstain",
                          name: "Kotak Kosong",
                          party: "Golput",
                          color: "#9ca3af",
                          platform:
                            "Pemilih memilih untuk tidak memberikan suara kepada kandidat mana pun.",
                          votes: 0,
                        },
                      ],
                    }));
                  }}
                  disabled={managedElection.status !== "draft"}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Tambahkan Golput
                </Button>
              )}
            </div>
            {candidateMessage && (
              <p className="text-sm font-medium text-destructive">
                {candidateMessage}
              </p>
            )}

            <div className="space-y-2">
              {managedElection.candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex items-start justify-between gap-3 rounded-md border bg-background p-3"
                >
                  <div>
                    <p className="font-semibold">{candidate.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {candidate.party}
                    </p>
                  </div>
                  {candidate.id !== "abstain" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeCandidate(candidate.id)}
                      disabled={managedElection.status !== "draft"}
                      aria-label={`Hapus ${candidate.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monitoring Pemilih</CardTitle>
            <CardDescription>
              Masukkan daftar Email, ID, atau NIM yang diizinkan memilih.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <input
                className="h-11 min-w-0 flex-1 rounded-md border bg-background px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder="Nama Pemilih *"
                value={voterIdentifierDraft}
                onChange={(event) =>
                  setVoterIdentifierDraft(event.target.value)
                }
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addVoterIdentifier}
                disabled={managedElection.status !== "draft"}
              >
                <Plus className="size-4" aria-hidden="true" />
                Tambah
              </Button>
            </div>
            {voterMessage && (
              <p className="text-sm font-medium text-destructive">
                {voterMessage}
              </p>
            )}
            <div className="max-h-80 space-y-2 overflow-auto pr-1">
              {managedElection.authorizedVoters.map((voter) => (
                <div
                  key={voter.id}
                  className="flex items-center justify-between gap-3 rounded-md border bg-background p-3"
                >
                  <div>
                    <p className="font-semibold">
                      {voter.name || voter.identifier || voter.id}
                    </p>
                    <p className="text-sm font-mono text-muted-foreground">
                      Token: {voter.identifier}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={voter.hasVoted ? "verified" : "outline"}>
                      {voter.hasVoted ? "Sudah memilih" : "Belum"}
                    </Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeVoterIdentifier(voter.id)}
                      disabled={managedElection.status !== "draft"}
                      aria-label={`Hapus pemilih ${voter.identifier || voter.id}`}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </div>
              ))}
              {managedElection.authorizedVoters.length === 0 ? (
                <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
                  Belum ada pemilih yang terdaftar di DPT.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="seal-panel border-crypto/25">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-crypto" aria-hidden="true" />
            Dekripsi Hasil Akhir
          </CardTitle>
          <CardDescription>
            Private key dan fungsi dekripsi hanya berada di area admin setelah
            pemilihan selesai.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            type="button"
            onClick={decryptFinalTally}
            disabled={managedElection.status !== "closed" || isDecrypting}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {isDecrypting ? "Memproses Tally..." : "Dekripsi Tally Agregat"}
          </Button>
          <div
            className="rounded-md border bg-background p-3"
            aria-live="polite"
          >
            <p className="text-sm font-semibold">Log Agregasi</p>
            <div className="mt-2 space-y-2 text-sm text-muted-foreground">
              {aggregationLogs.length > 0 ? (
                aggregationLogs.map((log) => (
                  <p key={log} className="font-mono">
                    {log}
                  </p>
                ))
              ) : (
                <p>
                  Log akan muncul setelah pemilihan ditutup dan admin
                  menjalankan dekripsi.
                </p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {managedElection.candidates.map((candidate) => (
              <ProofTile
                key={candidate.id}
                label={candidate.name}
                value={
                  finalTally !== null
                    ? `${finalTally[candidate.id] ?? 0} suara`
                    : "🔒 Terenkripsi"
                }
              />
            ))}
          </div>
          <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
            {adminMessage}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Riwayat Sesi</CardTitle>
          <CardDescription>
            Sesi yang sudah disimpan tetap ada di riwayat, sementara form utama
            kembali kosong.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {history.length === 0 ? (
            <p className="rounded-md border bg-background p-3 text-sm text-muted-foreground">
              Belum ada sesi yang disimpan.
            </p>
          ) : (
            history.map((session) => (
              <div
                key={session.id}
                className="grid gap-2 rounded-md border bg-background p-3"
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <p className="font-semibold flex items-center gap-2">
                      {session.title || "Sesi tanpa judul"}
                      <Badge
                        variant={
                          session.status === "closed" ? "verified" : "outline"
                        }
                      >
                        {session.status.toUpperCase()}
                      </Badge>
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.region || "Organisasi/Instansi kosong"} ·{" "}
                      {session.candidates.length} kandidat ·{" "}
                      {session.ballotsCast} suara
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setViewedHistoryId(
                          viewedHistoryId === session.id ? null : session.id,
                        )
                      }
                    >
                      <BarChart2 className="size-4 mr-2" />
                      Grafik
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() => deleteHistory(session.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
                {viewedHistoryId === session.id && (
                  <div className="mt-4 pt-4 border-t h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={session.candidates.map((c) => ({
                          name: c.name,
                          votes: c.votes,
                          color: c.color,
                        }))}
                        margin={{ top: 20, right: 0, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          opacity={0.5}
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          fontSize={12}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: "transparent" }}
                          contentStyle={{
                            borderRadius: "8px",
                            border: "none",
                            boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                          }}
                        />
                        <Bar
                          dataKey="votes"
                          radius={[4, 4, 0, 0]}
                          maxBarSize={60}
                        >
                          {session.candidates.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                          <LabelList
                            dataKey="votes"
                            position="top"
                            className="fill-foreground font-semibold"
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function ProofTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 break-words font-mono text-lg font-black">{value}</p>
    </div>
  );
}
