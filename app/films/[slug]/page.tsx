import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import films from "@/data/films.json";
import tmdb from "@/data/lineup-tmdb.json";
import screeningsData from "@/data/screenings.json";
import { SYNOPSES, type Synopsis } from "@/lib/synopses";
import FilmActions from "./FilmActions";
import styles from "./film.module.css";

type FilmRec = {
  id: number; slug: string; title: string; programme: string; directors?: string | null;
  countries?: string[]; languages?: string[]; premium?: boolean; noNotePublished?: boolean;
};
type Tmdb = { matched?: boolean; exact?: boolean; poster?: string | null; backdrop?: string | null;
  trailerKey?: string | null; overview?: string | null; genres?: string[]; year?: number | null };

const FILMS = films as FilmRec[];
const SYN: Record<string, Synopsis> = SYNOPSES;
const TMDB = tmdb as Record<string, Tmdb>;

// All 244 are prerendered: the lineup is fixed for the festival, so there is no
// reason to render these on demand.
export function generateStaticParams() {
  return FILMS.map((f) => ({ slug: f.slug }));
}

export async function generateMetadata({ params }: PageProps<"/films/[slug]">) {
  const { slug } = await params;
  const film = FILMS.find((f) => f.slug === slug);
  if (!film) return {};
  const s = SYN[slug];
  const description = (s?.teaser ?? s?.synopsis ?? "").replace(/<[^>]+>/g, "").slice(0, 200);
  return { title: `${film.title} — Festival Triage`, description };
}

export default async function FilmPage({ params }: PageProps<"/films/[slug]">) {
  const { slug } = await params;
  const film = FILMS.find((f) => f.slug === slug);
  if (!film) notFound();

  const s = SYN[slug] ?? {};
  const t = TMDB[slug] ?? {};
  const runtime = (screeningsData as { film_id: number; runtime?: number }[])
    .find((x) => x.film_id === film.id)?.runtime;

  // Only trust artwork from an exact title match — a fuzzy hit would put a
  // completely different film's poster on the page.
  const art = t.matched && t.exact ? t : {};
  const paragraphs = (s.synopsis ?? "").split("\n\n").filter(Boolean);

  return (
    <main className="wrap">
      <p className={styles.back}>
        <Link href="/films">&larr; Back to your lineup</Link>
      </p>

      <article className={styles.layout}>
        <div className={styles.body}>
          <header className={styles.head}>
            <p className="eyebrow">{film.programme}</p>
            <h1 className={styles.title}>{film.title}</h1>
            <p className="meta">
              {film.directors && <span>{film.directors}</span>}
              {runtime && <span>{runtime} min</span>}
              {film.countries?.length ? <span>{film.countries.join(", ")}</span> : null}
              {film.languages?.length ? <span>{film.languages.join(", ")}</span> : null}
              {film.premium && <span className={styles.premium}>Premium screening</span>}
            </p>
          </header>

          {paragraphs.length > 0 ? (
            <div className={styles.note}>
              <h2 className={styles.h2}>TIFF&rsquo;s note</h2>
              {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
              {s.url && (
                <p className={styles.source}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">Read on tiff.net &rarr;</a>
                </p>
              )}
            </div>
          ) : (
            <div className={styles.note}>
              <h2 className={styles.h2}>TIFF&rsquo;s note</h2>
              <p className={styles.missing}>
                TIFF doesn&rsquo;t publish a programmer&rsquo;s note for this one
                {film.noNotePublished ? " — it's a shorts package rather than a single film" : ""}.
                {t.overview ? " The summary below comes from TMDB instead." : ""}
              </p>
              {t.overview && <p>{t.overview}</p>}
            </div>
          )}

          {art.trailerKey && (
            <section className={styles.trailerWrap}>
              <h2 className={styles.h2}>Trailer</h2>
              <div className={styles.trailer}>
                <iframe
                  src={`https://www.youtube-nocookie.com/embed/${art.trailerKey}`}
                  title={`${film.title} trailer`}
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </section>
          )}
        </div>

        <aside className={styles.side}>
          {art.poster && (
            <Image
              className={styles.poster}
              src={`https://image.tmdb.org/t/p/w500${art.poster}`}
              alt={`Poster for ${film.title}`}
              width={500}
              height={750}
              sizes="(max-width: 900px) 40vw, 300px"
            />
          )}
          <FilmActions filmId={film.id} />
        </aside>
      </article>
    </main>
  );
}
