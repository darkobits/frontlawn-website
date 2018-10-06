import ms from 'ms';
import queryString from 'query-string';
// @ts-ignore
import shuffleSeed from 'shuffle-seed';

import {CACHE_TTL} from 'etc/constants';
import {LooseObject, UnsplashPhotoResource} from 'etc/types';
import client from 'lib/client';
import storage from 'lib/storage';
import {greaterOf} from 'lib/utils';


interface CollectionCache {
  photos: Array<UnsplashPhotoResource>;
  updatedAt: number;
}


/**
 * Returns an array of all images in the Front Lawn collection. The response
 * will be persisted to local storage to improve load times and asynchronously
 * updated in the background.
 *
 * See: lambda/images.ts.
 */
export async function getPhotos() {
  const COLLECTION_CACHE_KEY = 'photoCollection';

  let photoCollection;

  // Sub-routine that fetches up-to-date image collection data, immediately
  // resolves with it, then caches it to local storage.
  const fetchAndUpdateCollection = async (): Promise<CollectionCache> => {
    const photos = (await client.get('/images')).data;

    if (process.env.NODE_ENV === 'development') {
      console.debug(`[getImages] Fetched ${photos.length} images.`);
    }

    const cacheData: CollectionCache = {photos, updatedAt: Date.now()};
    storage.setItem(COLLECTION_CACHE_KEY, cacheData); // tslint:disable-line no-floating-promises
    return cacheData;
  };

  const storageKeys = await storage.keys();

  // If the cache is empty, fetch collection data and cache it.
  if (!storageKeys.includes(COLLECTION_CACHE_KEY)) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[getImages] Cache empty.');
    }

    photoCollection = (await fetchAndUpdateCollection()).photos;
  } else {
    // Otherwise, get data from the cache.
    const cachedData = await storage.getItem<CollectionCache>(COLLECTION_CACHE_KEY);

    // Then, if the data is stale, update it.
    if ((Date.now() - cachedData.updatedAt) >= ms(CACHE_TTL)) {
      fetchAndUpdateCollection(); // tslint:disable-line no-floating-promises
    }

    // Immediately resolve with cached data.
    photoCollection = cachedData.photos;
  }

  // Get the current 'name' from storage.
  const name = await storage.getItem<string>('name');

  // Use 'name' to deterministically shuffle the collection before returning it.
  return shuffleSeed.shuffle(photoCollection, name);
}


/**
 * Returns the current viewport width or viewport height, whichever is greater,
 * adjusted for the device's pixel ratio. At a pixel ratio of 1 or 2, the
 * dimension is returned as-is. For each pixel ratio above 2, the dimension is
 * increased by 50%.
 */
export function getScreenSize() {
  // window.devicePixelRatio;
  return greaterOf(window.screen.availWidth, window.screen.availHeight);
}


/**
 * Unsplash uses Imgix for dynamic image processing. These parameters ensure we
 * fetch an image that is appropriately sized for the current viewport.
 *
 * See: https://docs.imgix.com/apis/url
 */
export function buildOptions(overrides?: LooseObject): string {
  const params = {
    // Sets several baseline parameters.
    auto: 'format',
    // Fit the image to the provided width/height without cropping and while
    // maintaining its aspect ratio.
    fit: 'max',
    // Image width.
    w: getScreenSize(),
    // Image height.
    h: getScreenSize(),
    // Image quality.
    q: 80,
    // Apply any provided overrides.
    ...overrides
  };

  return queryString.stringify(params);
}


/**
 * Provided a base URL for an Unsplash image, returns a URL with Imgix query
 * params added.
 */
export function getFullImageUrl(baseUrl: string, options?: LooseObject) {
  return `${baseUrl}?${buildOptions(options)}`;
}


/**
 * Asynchronously pre-loads the image at the provided URL and returns a promise
 * that resolves when the image has finished loading.
 */
export async function preloadImage(imgUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve();
    };

    img.onerror = event => {
      reject(event);
    };

    img.src = imgUrl;
  });
}