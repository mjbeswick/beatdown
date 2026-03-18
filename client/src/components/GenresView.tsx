import { Tag } from 'lucide-react';

export default function GenresView() {
  return (
    <main className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <Tag size={40} className="mx-auto mb-3 text-zinc-700" />
        <p className="text-zinc-600 text-sm">
          Genre data is not available from the Spotify embed API.
        </p>
      </div>
    </main>
  );
}
