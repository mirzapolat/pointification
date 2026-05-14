import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

export default function Imprint() {
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

      <main className="max-w-2xl mx-auto px-6 md:px-10 py-10">
        <h2 className="font-display text-4xl md:text-5xl font-bold mb-6">Imprint</h2>
        <p className="text-ink/60 mb-8">Information according to § 5 TMG.</p>

        <section className="card-chunk p-6 md:p-8 space-y-6">
          <Row label="Operator">Mirza Polat</Row>
          <Row label="Contact">
            <a href="https://mirzapolat.com" target="_blank" rel="noreferrer noopener" className="underline decoration-2 underline-offset-4 hover:text-candy-pink">
              mirzapolat.com
            </a>
          </Row>
          <Row label="Responsible for content (§ 18 Abs. 2 MStV)">Mirza Polat</Row>
        </section>

        <section className="mt-8 space-y-3 text-sm text-ink/70 leading-relaxed">
          <h3 className="font-display text-xl font-bold text-ink">Disclaimer</h3>
          <p>
            The contents of this site have been prepared with care. However, no
            liability is assumed for the correctness, completeness, or timeliness
            of the content. Liability claims against the operator regarding
            material or non-material damages caused by the use of the provided
            information are excluded, unless the operator acted with intent or
            gross negligence.
          </p>
          <p>
            This site contains links to external third-party websites. The
            operator has no influence over their content and accepts no
            responsibility for it. Responsibility for the content of linked sites
            lies solely with their operators.
          </p>
        </section>
      </main>
    </motion.div>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6">
      <div className="text-xs uppercase tracking-wider text-ink/60 font-semibold w-56 shrink-0">{label}</div>
      <div className="font-semibold">{children}</div>
    </div>
  )
}
