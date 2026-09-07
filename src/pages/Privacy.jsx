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
          <img src="/pointification.png" alt="Pointification" className="w-10 h-10 object-contain" />
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
            The web application is self-hosted by the operator on a dedicated
            server located in the European Union. Your account, games, teams,
            scores, point logs, and any game logo you upload are stored in a
            SQLite database and on the file system of that same server — no
            third-party database, authentication, or storage service is
            involved. The only processor is:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>
              <strong>Hosting:</strong> Hetzner Online GmbH (
              <a href="https://www.hetzner.com/legal/privacy-policy" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
                hetzner.com
              </a>
              ) — provides the EU-based server that delivers the web application.
            </li>
          </ul>
          <p>
            Hetzner processes data in the European Union. A data processing
            contract under Art. 28 GDPR is in place.
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
            signed in. There are no advertising cookies and no third-party
            tracking pixels.
          </p>
          <p>
            For visitor statistics the site uses{' '}
            <a href="https://umami.is" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
              Umami
            </a>
            , an open-source analytics tool that the operator self-hosts on his
            own infrastructure. No data is passed to an external analytics
            provider. Umami sets no cookies and stores no identifier in your
            browser; visits are counted using a hash that is derived from your
            IP address and browser and rotates daily, so it cannot be traced
            back to you or followed across days or across other websites. Your
            IP address itself is never stored.
          </p>
          <p>Each measurement records only:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>the page visited, the referring page, browser, operating system, device type, and screen size</li>
            <li>the country derived from the IP address, which is then discarded</li>
            <li>
              a handful of named actions — account created, game created, points
              scored, public link enabled, public scoreboard viewed, collaborator
              invited, donate link clicked — recorded as counts, with no account,
              game, or team attached
            </li>
          </ul>
          <p>
            Page addresses are anonymised before they are recorded: game ids and
            public share tokens are replaced with placeholders, so a share link
            never appears in the statistics. Legal basis: Art. 6(1)(f) GDPR
            (legitimate interest in understanding how the service is used).
            Because no cookies are set and no personal data is stored, no
            consent banner is required. You can opt out of the counting entirely
            by enabling “Do Not Track” in your browser.
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
