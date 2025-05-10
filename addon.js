import pkg from 'stremio-addon-sdk';
const { addonBuilder, serveHTTP } = pkg;
import { getMovie, getTv } from './TMDB-Embed-API/src/api.js';
import { getMovieFromTmdb, getTvFromTmdb } from './TMDB-Embed-API/src/workers/tmdb.js';
import fetch from 'node-fetch';

const manifest = {
    id: 'org.voidsrc.addon',
    version: '1.0.0',
    name: 'Void Src',
    description: 'Watch movies and TV shows using multiple providers (2Embed, EmbedSU, AutoEmbed, VidsrcSU)',
    types: ['movie', 'series'],
    catalogs: [],
    resources: ['stream'],
    idPrefixes: ['tt']
};

const builder = new addonBuilder(manifest);

// Convert IMDB ID to TMDB ID
async function getTMDBId(imdbId, type) {
    try {
        const response = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=fb7bb23f03b6994dafc674c074d01761&external_source=imdb_id`);
        const data = await response.json();
        
        if (type === 'movie' && data.movie_results && data.movie_results.length > 0) {
            return data.movie_results[0].id;
        } else if (type === 'series' && data.tv_results && data.tv_results.length > 0) {
            return data.tv_results[0].id;
        }
        return null;
    } catch (error) {
        console.error('Error converting IMDB to TMDB:', error);
        return null;
    }
}

// Extract season and episode from Stremio ID
function parseSeriesId(id) {
    const matches = id.match(/tt\d+:(\d+):(\d+)/);
    if (!matches) return null;
    return {
        season: parseInt(matches[1]),
        episode: parseInt(matches[2])
    };
}

// Stream handler
builder.defineStreamHandler(async ({ type, id }) => {
    console.log('Request for streams:', type, id);
    
    try {
        // Extract the IMDB ID from the Stremio ID
        const imdbId = id.split(':')[0];
        if (!imdbId.startsWith('tt')) {
            return { streams: [] };
        }

        const tmdbId = await getTMDBId(imdbId, type);
        if (!tmdbId) {
            console.log('No TMDB ID found for:', imdbId);
            return { streams: [] };
        }

        let streamData;
        if (type === 'movie') {
            const movieInfo = await getMovieFromTmdb(tmdbId);
            if (movieInfo instanceof Error) {
                console.error('Error getting movie info:', movieInfo.message);
                return { streams: [] };
            }
            streamData = await getMovie(movieInfo);
        } else if (type === 'series') {
            const episodeInfo = parseSeriesId(id);
            if (!episodeInfo) {
                console.log('Could not parse season/episode from:', id);
                return { streams: [] };
            }

            const { season, episode } = episodeInfo;
            console.log(`Fetching S${season}E${episode} for TMDB ID ${tmdbId}`);
            
            // Get the TV show's external IDs first
            const externalIdsResponse = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=fb7bb23f03b6994dafc674c074d01761`);
            const externalIds = await externalIdsResponse.json();
            
            const tvInfo = {
                type: 'tv',
                title: '', // Will be filled by getTvFromTmdb
                releaseYear: null, // Will be filled by getTvFromTmdb
                tmdbId: tmdbId,
                imdbId: externalIds.imdb_id,
                season: season,
                episode: episode
            };
            
            streamData = await getTv(tvInfo, season, episode);
        }

        if (!streamData || streamData instanceof Error || !Array.isArray(streamData) || streamData.length === 0) {
            console.log('No streams found');
            return { streams: [] };
        }

        // Convert the stream data to Stremio format
        const streams = [];
        for (const item of streamData) {
            if (item.source && item.source.files) {
                for (const file of item.source.files) {
                    streams.push({
                        title: `${item.source.provider} - ${file.quality || 'Unknown'} ${file.type || ''}`,
                        url: file.file,
                        behaviorHints: {
                            bingeGroup: item.source.provider.toLowerCase().replace('/', '_'),
                            notWebReady: true
                        }
                    });
                }
            }
        }

        return { streams };
    } catch (error) {
        console.error('Error in stream handler:', error);
        return { streams: [] };
    }
});

const port = process.env.PORT || 7000;
serveHTTP(builder.getInterface(), { port });
console.log('Addon running on port', port);
