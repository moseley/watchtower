import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "../components/Logo";

export const metadata: Metadata = {
  title: "Privacy — Watchtower",
  description: "What Watchtower collects, why, and who it is shared with.",
};

// NOTE: this describes what the code actually does today, but it is a legal
// statement about your app — read it and adjust the wording before relying on
// it. The contact address below MUST be filled in: Apple requires a working
// way for users to reach you about their data.
const CONTACT_EMAIL = "REPLACE_WITH_YOUR_SUPPORT_EMAIL";

const LAST_UPDATED = "31 July 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-3 text-[14px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen w-full bg-canvas text-ink">
      <div className="mx-auto w-full max-w-2xl px-5 py-12">
        <Link href="/" className="flex items-center gap-3 text-muted hover:text-ink">
          <Logo className="h-8 w-8" />
          <span className="text-[14px]">← Back to Watchtower</span>
        </Link>

        <h1 className="mt-8 text-[28px] font-bold tracking-[-.03em]">Privacy</h1>
        <p className="mt-2 font-mono text-[11px] text-faint">Last updated {LAST_UPDATED}</p>

        <p className="mt-6 text-[14px] leading-relaxed text-muted">
          Watchtower watches sources you choose and notifies you when something matches. It
          collects only what it needs to do that. There are no adverts, no analytics, and no
          third-party trackers, and your data is never sold.
        </p>

        <Section title="What is collected">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">A notification address.</strong> On a phone this is
              an Expo push token; in a browser it is a Web Push subscription. It identifies where
              to send alerts, not who you are.
            </li>
            <li>
              <strong className="text-white">The watches you create.</strong> For weather this
              includes the coordinates and label of the location you pick, and your threshold. For
              music it is the artist you selected.
            </li>
            <li>
              <strong className="text-white">Alerts that have been sent to you</strong> — the
              text, the time, and whether delivery succeeded — so the app can show your history.
            </li>
            <li>
              <strong className="text-white">Your platform</strong> (iOS, Android, or web).
            </li>
          </ul>
          <p>
            Location is only read when you tap the location button, and only while the app is
            open. Watchtower never tracks your location in the background. You can skip it
            entirely and type a city or postcode instead.
          </p>
        </Section>

        <Section title="What is not collected">
          <p>
            No name, email address, phone number, contacts, photos, or advertising identifiers.
            Watchtower has no accounts and no login, so it holds nothing that identifies you
            personally. Your data is tied to your device, not to you.
          </p>
        </Section>

        <Section title="Who it is shared with">
          <p>These services receive data because they are needed to make the app work:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-white">Open-Meteo</strong> — receives the coordinates of a
              weather watch to return a forecast, and place names you search for.
            </li>
            <li>
              <strong className="text-white">BigDataCloud</strong> — receives coordinates to turn
              them into a place name when you use the location button.
            </li>
            <li>
              <strong className="text-white">MusicBrainz</strong> — receives artist names you
              search for and the artists you watch.
            </li>
            <li>
              <strong className="text-white">Expo, Apple (APNs), and Google (FCM)</strong> —
              deliver push notifications to your device.
            </li>
            <li>
              <strong className="text-white">Vercel and Neon</strong> — host the service and store
              its database.
            </li>
          </ul>
          <p>Nothing is shared with anyone else, and nothing is sold or used for advertising.</p>
        </Section>

        <Section title="Keeping and deleting your data">
          <p>
            Watches and their alert history are kept until you delete them. Deleting a watch in
            the app also deletes the alerts it produced. Uninstalling the app stops notifications
            reaching you, but does not by itself erase what is stored.
          </p>
          <p>
            To have everything associated with your device removed, email{" "}
            <span className="font-mono text-blue-400">{CONTACT_EMAIL}</span> and it will be
            deleted.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Watchtower is not directed at children and does not knowingly collect information from
            them.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes, the date at the top will change with it. Material changes will
            be noted in the app.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about privacy or your data:{" "}
            <span className="font-mono text-blue-400">{CONTACT_EMAIL}</span>
          </p>
        </Section>

        <Section title="Data sources and credits">
          <p>Watchtower is built on data generously made available by others:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Weather and geocoding by{" "}
              <a className="text-blue-400 hover:underline" href="https://open-meteo.com/">
                Open-Meteo
              </a>{" "}
              (CC BY 4.0)
            </li>
            <li>
              Music metadata by{" "}
              <a className="text-blue-400 hover:underline" href="https://musicbrainz.org/">
                MusicBrainz
              </a>
            </li>
            <li>
              Reverse geocoding by{" "}
              <a className="text-blue-400 hover:underline" href="https://www.bigdatacloud.com/">
                BigDataCloud
              </a>
            </li>
            <li>
              Album artwork and store links from the{" "}
              <a className="text-blue-400 hover:underline" href="https://www.apple.com/itunes/">
                iTunes Search API
              </a>
            </li>
          </ul>
        </Section>
      </div>
    </main>
  );
}
