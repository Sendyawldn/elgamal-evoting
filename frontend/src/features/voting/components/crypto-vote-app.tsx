"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BadgeCheck,
  Check,
  Clock,
  Copy,
  Download,
  KeyRound,
  LockKeyhole,
  ReceiptText,
  SearchCheck,
  ShieldCheck,
  Vote,
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
import { Progress } from "@/components/ui/progress";
import type { Election, VoteReceipt, Voter } from "../types";
import type { VoteLedgerEntry } from "@/lib/elgamal-vote";
import {
  DEMO_ELGAMAL_PARAMETERS,
  deserializePublicKey,
  type ElGamalPublicKey,
  type SerializedElGamalPublicKey,
} from "@/lib/elgamal";
import {
  createReceipt,
  getCandidatePercent,
  getTurnoutPercentage,
} from "../tally";
import { cn } from "@/lib/utils";
import { apiGet, apiPost } from "@/lib/api-client";
type CryptoVoteAppProps = {
  election: Election;
};

const FALLBACK_PUBLIC_KEY: ElGamalPublicKey = {
  ...DEMO_ELGAMAL_PARAMETERS,
  y: 75722817019112715260614520892165275654n,
};

export function CryptoVoteApp({ election }: CryptoVoteAppProps) {
  const [liveElection, setLiveElection] = useState(election);
  const [electionPublicKey, setElectionPublicKey] =
    useState<ElGamalPublicKey>(FALLBACK_PUBLIC_KEY);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [voterIdentifier, setVoterIdentifier] = useState("");
  const [verifiedVoter, setVerifiedVoter] = useState<Voter | null>(null);
  const [voterCheckMessage, setVoterCheckMessage] = useState(
    "Masukkan Email, ID, atau NIM lalu tekan Cek DPT.",
  );
  const [receipt, setReceipt] = useState<VoteReceipt | null>(null);
  const [voteLedger, setVoteLedger] = useState<VoteLedgerEntry[]>([]);
  const [serverLedgerSize, setServerLedgerSize] = useState(0);
  const [receiptActionMessage, setReceiptActionMessage] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [verificationMessage, setVerificationMessage] = useState(
    "Tempel token EGV1 dari receipt untuk mengecek status hitung.",
  );
  const [verificationStatus, setVerificationStatus] = useState<
    "idle" | "verified" | "invalid"
  >("idle");
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    async function loadElectionState() {
      try {
        const [body, publicKeyBody] = await Promise.all([
          apiGet<{ election: Election }>("/api/admin/election"),
          apiGet<{ publicKey: SerializedElGamalPublicKey }>(
            "/api/elections/public-key",
          ),
        ]);

        setLiveElection(body.election);
        setElectionPublicKey(deserializePublicKey(publicKeyBody.publicKey));
      } catch (err) {
        // Handle error
      }
    }

    loadElectionState();
  }, []);

  const selectedCandidate = (liveElection.candidates || []).find(
    (candidate) => candidate.id === selectedCandidateId,
  );
  const turnout = getTurnoutPercentage(
    liveElection.ballotsCast,
    liveElection.totalVoters,
  );
  const trendData = useMemo(
    () =>
      Array.from({ length: 6 }, (_, index) => ({
        tick: `${index + 1}`,
        ballots: Math.max(0, liveElection.ballotsCast - (5 - index) * 18),
      })),
    [liveElection.ballotsCast],
  );

  function checkVoter() {
    const normalizedInput = voterIdentifier.trim().toUpperCase();
    const foundVoter = (liveElection.authorizedVoters || []).find(
      (voter) => voter.identifier === normalizedInput,
    );

    setReceipt(null);
    setSelectedCandidateId("");
    setVerificationToken("");
    setVerificationStatus("idle");
    setVerificationMessage(
      "Tempel token EGV1 dari receipt untuk mengecek status hitung.",
    );

    if (!foundVoter) {
      setVerifiedVoter(null);
      setVoterCheckMessage("Data tidak ada di DPT. Hubungi admin.");
      return;
    }

    if (foundVoter.hasVoted) {
      setVerifiedVoter(null);
      setVoterCheckMessage("Pemilih ini sudah tercatat memilih.");
      return;
    }

    setVerifiedVoter(foundVoter);
    setVoterCheckMessage(
      `DPT valid. Selamat datang, ${foundVoter.name || "Pemilih"}.`,
    );
  }

  async function castVote() {
    if (!selectedCandidateId || receipt || !verifiedVoter) {
      return;
    }

    if (liveElection.status !== "open") {
      setVerificationStatus("invalid");
      setVerificationMessage("Pemilihan belum dibuka atau sudah selesai.");
      return;
    }

    const nextReceipt = createReceipt(
      selectedCandidateId,
      (liveElection.candidates || []).map((candidate) => candidate.id),
      new Date(),
      electionPublicKey,
    );
    try {
      const payload = {
        voterIdentifier: getPrimaryVoterIdentifier(verifiedVoter),
        candidateId: selectedCandidateId,
        receipt: {
          receiptHash: nextReceipt.receiptHash,
          token: nextReceipt.verificationToken,
          createdAt: nextReceipt.createdAt,
          encryptedChoices: nextReceipt.encryptedChoices,
        },
      };
      const body = await apiPost<{ election: Election; ledgerSize?: number }>(
        `/api/elections/${liveElection.id}/results`,
        payload,
      );

      setReceipt(nextReceipt);
      setVerificationToken(nextReceipt.verificationToken);
      setVoteLedger((current) => [
        ...current,
        {
          receiptHash: nextReceipt.receiptHash,
          token: nextReceipt.verificationToken,
          createdAt: nextReceipt.createdAt,
          candidateId: selectedCandidateId,
          voterName: getPrimaryVoterIdentifier(verifiedVoter),
          encryptedChoices: nextReceipt.encryptedChoices,
        },
      ]);
      setLiveElection((prev) => ({
        ...prev,
        ...body.election,
        candidates: body.election.candidates ?? prev.candidates ?? [],
        authorizedVoters:
          body.election.authorizedVoters ?? prev.authorizedVoters ?? [],
      }));
      setServerLedgerSize(body.ledgerSize ?? voteLedger.length + 1);
      setVerifiedVoter(null);
      setReceiptActionMessage("Token siap disalin atau diunduh.");
    } catch (err: any) {
      const message = err.message ?? "Suara ditolak oleh sistem pusat.";
      setVerificationStatus("invalid");
      setVerificationMessage(message);
      setVoterCheckMessage(message);
      setVerifiedVoter(null);
    }
  }

  async function verifyToken() {
    try {
      const result = await apiPost<{
        status: string;
        message?: string;
        title?: string;
        ledgerSize?: number;
      }>(`/api/elections/${liveElection.id}/verify`, {
        token: verificationToken.trim(),
      });

      setVerificationStatus(
        result.status === "verified" ? "verified" : "invalid",
      );
      setVerificationMessage(
        result.message ?? result.title ?? "Token tidak valid.",
      );

      if (typeof result.ledgerSize === "number") {
        setServerLedgerSize(result.ledgerSize);
      }
    } catch (err: any) {
      setVerificationStatus("invalid");
      setVerificationMessage(err.message ?? "Token tidak valid.");
    }
  }

  async function copyReceiptToken() {
    if (!receipt) {
      return;
    }

    try {
      await navigator.clipboard.writeText(receipt.verificationToken);
      setReceiptActionMessage("Token disalin ke clipboard.");
    } catch {
      setReceiptActionMessage(
        "Clipboard tidak tersedia. Salin token dari panel receipt.",
      );
    }
  }

  function downloadReceiptToken() {
    if (!receipt) {
      return;
    }

    const content = [
      "CryptoVote Receipt",
      `Hash: ${receipt.receiptHash}`,
      `Created At: ${receipt.createdAt}`,
      "",
      receipt.verificationToken,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `cryptovote-receipt-${receipt.receiptHash}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setReceiptActionMessage("Receipt TXT diunduh.");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
      <header className="counting-table rounded-lg border p-5 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-4xl">
            <Badge
              variant="secondary"
              className="mb-4 gap-2 border-primary/20 bg-primary/10 text-foreground"
            >
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Rekapitulasi Homomorfik El Gamal
            </Badge>
            <h1 className="max-w-3xl text-4xl font-black tracking-normal text-foreground sm:text-6xl">
              Evoting
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
              {liveElection.title || "Pemilihan belum dikonfigurasi"} untuk{" "}
              {liveElection.region || "wilayah belum diisi"}. Pilih kandidat,
              kunci suara, lalu pantau agregasi terenkripsi tanpa membuka
              pilihan individu.
            </p>
          </div>
          <div className="grid gap-3 sm:min-w-[26rem] sm:grid-cols-2">
            <StatusTile label="Partisipasi" value={`${turnout}%`} icon={Vote} />
            <StatusTile
              label="Status"
              value={liveElection.status.toUpperCase()}
              icon={Clock}
            />
          </div>
        </div>

        <div className="mt-6 grid gap-3 border-t pt-5 md:grid-cols-4">
          <CustodyStep
            label="1. DPT"
            value={verifiedVoter ? "Pemilih valid" : "Cek pemilih"}
          />
          <CustodyStep
            label="2. Enkripsi"
            value={receipt ? "Receipt tersegel" : "Siap El Gamal"}
          />
          <CustodyStep
            label="3. Kotak Suara"
            value={`${serverLedgerSize || voteLedger.length} token`}
          />
          <CustodyStep
            label="4. Rekapitulasi"
            value={liveElection.status === "closed" ? "Final" : "Terkunci"}
          />
        </div>
      </header>

      <section className="custody-rail grid gap-4 rounded-lg border p-4 shadow-sm sm:grid-cols-[1fr_auto]">
        <label className="grid gap-2 text-sm font-medium">
          Token Rahasia
          <input
            className="h-11 rounded-md border bg-card px-3 outline-none focus-visible:ring-2 focus-visible:ring-ring uppercase"
            value={voterIdentifier}
            onChange={(event) => {
              setVoterIdentifier(event.target.value);
              setVerifiedVoter(null);
              setReceipt(null);
              setReceiptActionMessage("");
              setSelectedCandidateId("");
              setVoterCheckMessage("Tekan Cek DPT untuk membuka surat suara.");
            }}
            placeholder="Masukkan Token Rahasia (misal: 8XF2A9)"
          />
          <span className="text-xs text-muted-foreground">
            {voterCheckMessage}
          </span>
        </label>
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={checkVoter}
            disabled={!voterIdentifier.trim()}
          >
            <Check className="size-4" aria-hidden="true" />
            Cek DPT
          </Button>
          <Badge
            variant={verifiedVoter ? "verified" : "outline"}
            className="min-h-11 px-4"
          >
            {verifiedVoter ? "DPT valid" : "Belum dicek"}
          </Badge>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.05fr_0.88fr_1.08fr]">
        <Card className="order-1 overflow-hidden border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Vote className="size-5 text-primary" aria-hidden="true" />
              Surat Suara
            </CardTitle>
            <CardDescription>
              Cek Email/ID/NIM terlebih dahulu, lalu pilih kandidat dan kunci
              suara terenkripsi.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(liveElection.candidates || []).map((candidate) => {
              const selected = selectedCandidateId === candidate.id;

              return (
                <button
                  key={candidate.id}
                  type="button"
                  className={cn(
                    "w-full rounded-lg border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected &&
                      "border-primary bg-secondary shadow-md ring-1 ring-primary/20",
                    receipt && !selected && "opacity-60",
                  )}
                  onClick={() =>
                    !receipt &&
                    verifiedVoter &&
                    setSelectedCandidateId(candidate.id)
                  }
                  aria-pressed={selected}
                >
                  <span className="flex items-start justify-between gap-4">
                    <span>
                      <span className="block text-base font-bold">
                        {candidate.name}
                      </span>
                      <span className="mt-1 block text-sm font-medium text-primary">
                        {candidate.party}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "flex size-7 items-center justify-center rounded-full border",
                        selected &&
                          "border-primary bg-primary text-primary-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <Check className="size-4" /> : null}
                    </span>
                  </span>
                </button>
              );
            })}

            {(liveElection.candidates || []).length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-4 text-sm leading-6 text-muted-foreground">
                Kandidat belum tersedia. Admin harus login ke /admin dan mengisi
                data pemilihan terlebih dahulu.
              </div>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              disabled={
                !selectedCandidateId ||
                Boolean(receipt) ||
                liveElection.status !== "open" ||
                !verifiedVoter
              }
              onClick={castVote}
            >
              <LockKeyhole className="size-4" aria-hidden="true" />
              {receipt ? "Suara Terkunci" : "Kunci dan Kirim Suara"}
            </Button>
          </CardContent>
        </Card>

        <Card className="seal-panel order-2 border-crypto/30 lg:order-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ReceiptText className="size-5 text-crypto" aria-hidden="true" />
              Receipt Terenkripsi
            </CardTitle>
            <CardDescription>
              Receipt membuktikan suara sudah masuk ke agregasi tanpa
              menampilkan pilihan plaintext.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed border-crypto/50 bg-secondary/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <Badge variant={receipt ? "verified" : "outline"}>
                  {receipt ? "Tersegel" : "Menunggu pilihan"}
                </Badge>
                <KeyRound className="size-5 text-crypto" aria-hidden="true" />
              </div>
              <div className="mt-5 min-h-28 rounded-md bg-card p-4 font-mono text-sm shadow-inner">
                {receipt ? (
                  <div className="space-y-3" aria-live="polite">
                    <p className="break-all text-base font-bold text-primary">
                      {receipt.encryptedBallot}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      Hash: {receipt.receiptHash}
                    </p>
                    <p className="text-muted-foreground">
                      {receipt.proofLabel}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Dibuat{" "}
                      {new Date(receipt.createdAt).toLocaleTimeString("id-ID")}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Pilihan {selectedCandidate?.name ?? "belum dipilih"} akan
                    disegel sebagai surat suara El Gamal.
                  </p>
                )}
              </div>
              {receipt ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={copyReceiptToken}
                  >
                    <Copy className="size-4" aria-hidden="true" />
                    Salin Token
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadReceiptToken}
                  >
                    <Download className="size-4" aria-hidden="true" />
                    Unduh TXT
                  </Button>
                  <p
                    className="text-xs text-muted-foreground sm:col-span-2"
                    aria-live="polite"
                  >
                    {receiptActionMessage}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Kesiapan verifikasi</span>
                <span className="font-mono">{receipt ? "100%" : "64%"}</span>
              </div>
              <Progress
                value={receipt ? 100 : 64}
                aria-label="Kesiapan verifikasi"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Token receipt memakai ciphertext El Gamal untuk setiap kandidat.
                Token tidak menyimpan nama kandidat yang dipilih dalam
                plaintext.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="order-3 overflow-hidden">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BadgeCheck
                    className="size-5 text-verified"
                    aria-hidden="true"
                  />
                  Status Partisipasi Pemilih
                </CardTitle>
                <CardDescription>
                  Tingkat partisipasi diperbarui dengan simulasi refresh ringan.
                </CardDescription>
              </div>
              <Badge variant="verified">{liveElection.ballotsCast} suara</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">Turnout</span>
                <span className="font-mono">
                  {liveElection.ballotsCast}/{liveElection.totalVoters}
                </span>
              </div>
              <Progress value={turnout} aria-label="Persentase partisipasi" />
            </div>

            <div className="h-24 w-full" aria-label="Tren ballot masuk">
              {hasMounted ? (
                <LineChart
                  data={trendData}
                  responsive
                  style={{ width: "100%", height: "100%" }}
                >
                  <XAxis dataKey="tick" hide />
                  <YAxis hide domain={["dataMin - 20", "dataMax + 20"]} />
                  <Tooltip
                    formatter={(value) => [`${value} suara`, "Surat Suara Masuk"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="ballots"
                    stroke="var(--verified)"
                    strokeWidth={3}
                    dot={false}
                    isAnimationActive={!receipt}
                  />
                </LineChart>
              ) : (
                <div className="h-full rounded-md bg-muted" />
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="border-verified/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <SearchCheck
                className="size-5 text-verified"
                aria-hidden="true"
              />
              Verifikasi Token
            </CardTitle>
            <CardDescription>
              Tempel token receipt untuk membuktikan ciphertext sudah masuk
              kotak suara tanpa membuka pilihan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-2 text-sm font-medium">
              Token EGV1
              <textarea
                className="min-h-28 resize-y rounded-md border bg-background p-3 font-mono text-xs leading-5 outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
                value={verificationToken}
                onChange={(event) => {
                  setVerificationToken(event.target.value);
                  setVerificationStatus("idle");
                }}
                placeholder="EGV1..."
              />
            </label>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={verifyToken}
              disabled={!verificationToken.trim()}
            >
              <SearchCheck className="size-4" aria-hidden="true" />
              Verifikasi Tanpa Reveal Pilihan
            </Button>
            <div
              className={cn(
                "rounded-md border p-3 text-sm leading-6",
                verificationStatus === "verified" &&
                  "border-verified bg-verified/10 text-foreground",
                verificationStatus === "invalid" &&
                  "border-destructive bg-destructive/10 text-foreground",
              )}
              aria-live="polite"
            >
              <span className="font-semibold">
                {verificationStatus === "verified"
                  ? "Terverifikasi"
                  : verificationStatus === "invalid"
                    ? "Tidak Valid"
                    : "Menunggu Token"}
              </span>
              <p className="mt-1 text-muted-foreground">
                {verificationMessage}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="seal-panel border-crypto/25">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-crypto" aria-hidden="true" />
              Bukti Homomorfik
            </CardTitle>
            <CardDescription>
              Setiap suara menyimpan vektor sandi. Rekapitulasi menjumlahkan dengan
              perkalian ciphertext per kandidat.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <ProofTile
              label="Kotak Suara Tersimpan"
              value={`${serverLedgerSize || voteLedger.length}`}
            />
            <ProofTile
              label="Modulus p"
              value={DEMO_ELGAMAL_PARAMETERS.p.toString()}
            />
            <ProofTile
              label="Generator g"
              value={DEMO_ELGAMAL_PARAMETERS.g.toString()}
            />
            <ProofTile label="Operasi rekapitulasi" value="C1 x C2 mod p" />
            <ProofTile label="Private key" value="Key ceremony produksi" />
            <ProofTile label="Reveal pilihan" value="Tidak" />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}

function StatusTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Vote;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          {label}
        </span>
        <Icon className="size-4 text-primary" aria-hidden="true" />
      </div>
      <p className="mt-2 font-mono text-2xl font-black">{value}</p>
    </div>
  );
}

function CustodyStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/75 p-3">
      <p className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-mono text-sm font-black text-foreground">
        {value}
      </p>
    </div>
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

function getPrimaryVoterIdentifier(voter: Voter) {
  return voter.identifier || voter.id || voter.email;
}
