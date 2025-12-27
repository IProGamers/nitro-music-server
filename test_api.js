
const fetchSong = async (songId, context = 'android') => {
    const url = new URL('https://www.jiosaavn.com/api.php');
    url.searchParams.append('__call', 'song.getDetails');
    url.searchParams.append('_format', 'json');
    url.searchParams.append('_marker', '0');
    url.searchParams.append('api_version', '4');
    url.searchParams.append('ctx', context);
    url.searchParams.append('pids', songId);

    try {
        const response = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        const data = await response.json();
        console.log(`--- CONTEXT: ${context} ---`);
        console.log(`Success: ${!!data.songs?.length}`);
        if (data.songs?.length) {
            console.log(`Song Title: ${data.songs[0].title}`);
            console.log(`Has Encryption: ${!!data.songs[0].more_info?.encrypted_media_url}`);
        } else {
            console.log(`Full Response: ${JSON.stringify(data)}`);
        }
        return data;
    } catch (e) {
        console.error(`Error with context ${context}:`, e.message);
    }
};

const runTest = async () => {
    // A known English song ID from the search test "Believer" (Example ID needed)
    // From my browser logs, I'll find a song ID.
    // Looking at the browser subagent output, I didn't get the exact ID.
    // I'll search first to get IDs.

    const searchQuery = 'Imagine Dragons Believer';
    const searchUrl = new URL('https://www.jiosaavn.com/api.php');
    searchUrl.searchParams.append('__call', 'search.getResults');
    searchUrl.searchParams.append('_format', 'json');
    searchUrl.searchParams.append('api_version', '4');
    searchUrl.searchParams.append('ctx', 'android');
    searchUrl.searchParams.append('q', searchQuery);

    const searchRes = await fetch(searchUrl.toString());
    const searchData = await searchRes.json();

    if (searchData.results?.length) {
        const song = searchData.results[0];
        const id = song.id;
        console.log(`Testing song: ${song.title} | ID: ${id}`);

        await fetchSong(id, 'android');
        await fetchSong(id, 'web6dot0');
        await fetchSong(id, 'web6bit'); // Alternative common context
    } else {
        console.log("Search failed to find test song.");
    }
};

runTest();
