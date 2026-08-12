"""djvibe — an electronic-musicology toolkit for organizing a rekordbox library.

Pipeline:
    extract  -> read the rekordbox collection into a normalized track table
    analyze  -> ML audio analysis (embeddings + mood/genre/danceability tags)
    cluster  -> UMAP + HDBSCAN to discover natural 'vibe' clusters
    dashboard-> build an interactive HTML similarity explorer
    writeback-> (optional) export cluster playlists back into rekordbox via XML

See README.md for the full playbook.
"""

__version__ = "0.1.0"
