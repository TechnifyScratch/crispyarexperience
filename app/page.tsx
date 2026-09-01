import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <main className="intro-page">
      <section className="intro-screen" aria-labelledby="hunt-title">
        <Image className="intro-logo" src="/images/crispy-cones-experiences-logo.webp" alt="Crispy Cones Experiences" width={720} height={377} priority />
        <Image className="intro-craig" src="/images/crispy-craig.webp" alt="" aria-hidden="true" width={1800} height={1800} priority />
        <div className="intro-shade" aria-hidden="true" />
        <div className="intro-copy">
          <h1 id="hunt-title">HEY!</h1>
          <p>My name is Crispy Craig, and I seem to have gotten lost…</p>
          <p>If you can find me in the store, I’ll have a surprise waiting for you when you place your order!</p>
        </div>
        <Link className="intro-start" href="/play">Start Searching!</Link>
      </section>
    </main>
  );
}
