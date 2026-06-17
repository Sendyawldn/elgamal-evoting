import { CryptoVoteApp } from "@/features/voting/components/crypto-vote-app"
import { election } from "@/features/voting/election-data"

export default function Home() {
  return <CryptoVoteApp election={election} />
}
