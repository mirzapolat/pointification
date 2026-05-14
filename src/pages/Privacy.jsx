import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Privacy() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-full bg-cream bg-grid"
    >
      <header className="px-6 md:px-10 py-6 flex items-center justify-between border-b-2 border-ink bg-cream/80 backdrop-blur sticky top-0 z-20">
        <Link to="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-candy-yellow border-2 border-ink grid place-items-center font-display font-bold">P!</div>
          <h1 className="font-display font-bold text-2xl">Pointification</h1>
        </Link>
        <Link to="/login" className="btn-chunk bg-white text-sm">← Back</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 md:px-10 py-10 space-y-10">
        <div>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-3">Privacy Policy</h2>
          <p className="text-ink/60">How Pointification handles your data, in plain language.</p>
        </div>

        <Section title="Who runs this service">
          <p>
            Pointification is operated by Mirza Polat. You can reach me through{' '}
            <a href="https://mirzapolat.com" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
              mirzapolat.com
            </a>.
          </p>
        </Section>

        <Section title="What data is collected">
          <p>When you create an account or use the service, the following data is stored:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>your email address (for sign-in and notifications)</li>
            <li>a hashed password</li>
            <li>games, teams, and scores that you create or that are shared with you</li>
            <li>point change logs (timestamp, team, delta, who made the change)</li>
            <li>technical access logs created by the hosting and database providers (IP address, user-agent, timestamp) — used for security and abuse prevention</li>
          </ul>
          <p>
            Public game links contain only an unguessable token and the game's
            current state (team names, scores). Anyone with the link can read
            those values until you turn sharing off or regenerate the link.
          </p>
        </Section>

        <Section title="Where the data is stored (Processors)">
          <p>
            Pointification does not run its own servers. The service is hosted on
            two SaaS platforms acting as processors on behalf of the operator:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Hosting:</strong> Vercel Inc. (
              <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
                vercel.com
              </a>
              ) — delivers the web application and runs the serverless functions.
            </li>
            <li>
              <strong>Database &amp; authentication:</strong> Supabase Inc. (
              <a href="https://supabase.com/privacy" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
                supabase.com
              </a>
              ) — stores your account, games, teams, scores, and point logs.
            </li>
          </ul>
          <p>
            Both providers may process data in the European Union and in the
            United States. Data protection contracts (Art. 28 GDPR) are in place
            with both processors and the applicable standard contractual clauses
            apply to any international transfer.
          </p>
        </Section>

        <Section title="Legal basis (GDPR)">
          <ul className="list-disc list-inside space-y-1">
            <li>Art. 6(1)(b) GDPR — performance of the contract (running the service for you).</li>
            <li>Art. 6(1)(f) GDPR — legitimate interest (security, abuse prevention, technical logs).</li>
            <li>Art. 6(1)(a) GDPR — consent, where applicable (e.g. when you publish a game via a public link).</li>
          </ul>
        </Section>

        <Section title="Cookies & tracking">
          <p>
            Pointification stores a session token in your browser so you stay
            signed in. There are no advertising cookies, no analytics, and no
            third-party tracking pixels.
          </p>
        </Section>

        <Section title="Your rights">
          <p>Under the GDPR you can ask to:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>access the personal data stored about you (Art. 15)</li>
            <li>correct inaccurate data (Art. 16)</li>
            <li>delete your account and data (Art. 17) — you can do this yourself from the Account page</li>
            <li>restrict or object to processing (Art. 18, 21)</li>
            <li>receive your data in a portable format (Art. 20)</li>
            <li>lodge a complaint with a data protection authority (Art. 77)</li>
          </ul>
          <p>
            To exercise these rights, contact{' '}
            <a href="https://mirzapolat.com" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
              mirzapolat.com
            </a>
            .
          </p>
        </Section>

        <Section title="Retention">
          <p>
            Account and game data is kept for as long as your account exists.
            When you delete your account, the games you own (and their teams,
            scores, and logs) are removed. Games that other users shared with
            you remain with their respective owners.
          </p>
          <p>
            Technical logs at the hosting and database providers are retained
            according to their own policies, typically a few days to a few weeks.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            This policy may be updated to reflect changes in the service or in
            applicable law. The current version always lives at this URL.
          </p>
        </Section>
      </main>
    </motion.div>
  )
}

function Section({ title, children }) {
  return (
    <section className="card-chunk p-6 md:p-8 space-y-3 leading-relaxed">
      <h3 className="font-display text-2xl font-bold">{title}</h3>
      <div className="space-y-3 text-ink/80">{children}</div>
    </section>
  )
}
