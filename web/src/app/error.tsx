"use client";
export default function ErrorPage({retry}:{retry:()=>void}) {
 return <main className="mx-auto max-w-xl p-8"><h1 className="font-display text-3xl">Data is temporarily unavailable.</h1><p className="mt-4">The snapshot may be updating or incompatible. No estimate is shown.</p><button type="button" className="mt-4 underline" onClick={retry}>Retry</button></main>;
}
