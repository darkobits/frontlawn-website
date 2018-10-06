import mousetrap from 'mousetrap';
import {mix, rgba} from 'polished';
import styled from 'react-emotion';
import React from 'react';

import PhotoContext from 'components/photo-context';
import SplashMid from 'components/splash-mid';
import SplashLower from 'components/splash-lower';
import {BACKGROUND_RULE_OVERRIDES} from 'etc/constants';
import {UnsplashPhotoResource} from 'etc/types';
import {getPhotos, preloadImage} from 'lib/photos';
import queryString from 'lib/query';
import R from 'lib/ramda';
import {sinceEpoch} from 'lib/time';
import {modIndex} from 'lib/utils';


// ----- Styled Elements -------------------------------------------------------

export interface StyledSplashProps {
  backgroundImage: string;
  maskColor: string;
  backgroundPosition?: string;
  maskAmount?: string;
  transform?: string;
}

const StyledSplash = styled.div<StyledSplashProps>`
  align-items: center;
  display: flex;
  flex-direction: column;
  height: 100%;
  justify-content: center;
  padding: 14px 18px;
  width: 100%;

  &::before {
    background-attachment: fixed;
    background-image: url(${R.prop('backgroundImage')});
    background-position: ${R.propOr('center center', 'backgroundPosition')};
    background-repeat: no-repeat;
    background-size: cover;
    bottom: 0;
    content: ' ';
    display: block;
    left: 0;
    position: absolute;
    right: 0;
    top: 0;
    transform: ${R.propOr('initial', 'transform')};
    z-index: 0;
  }

  &::after {
    background-color: ${props => rgba(mix(0.5, props.maskColor, 'black'), Number(props.maskAmount || 0.2))};
    bottom: 0;
    content: ' ';
    display: block;
    left: 0;
    mix-blend-mode: darken;
    position: absolute;
    right: 0;
    top: 0;
    transform: ${R.propOr('initial', 'transfor')};
    z-index: 0;
  }
`;

// background-color: rgba(200, 200, 200, 0.5);
// background-color: ${props => rgba(props.maskColor, Number(props.maskAmount || '0.2'))};
interface SwatchProps {
  color: string;
}

const Swatch = styled.div<SwatchProps>`
  background-color: ${({color}) => color};
  position: absolute;
  width: 50px;
  height: 50px;
  top: 0;
  right: 0;
  z-index: 1;
`;


// ----- Component -------------------------------------------------------------

export interface SplashState {
  photos: Array<UnsplashPhotoResource>;
  index: number;
  showSwatch: boolean;
}


export default class Splash extends React.Component<{}, SplashState> {
  state = {
    photos: [] as Array<UnsplashPhotoResource>,
    index: 0,
    showSwatch: false
  };


  /**
   * In development, allows the left/right arrow keys to switch between photos
   * in the collection.
   */
  private enableKeyboardShortcuts() {
    if (process.env.NODE_ENV === 'development') {
      mousetrap.bind('left', () => {
        this.setState(prevState => ({index: modIndex(prevState.index - 1, this.state.photos)}));
      });

      mousetrap.bind('right', () => {
        this.setState(prevState => ({index: modIndex(prevState.index + 1, this.state.photos)}));
      });

      console.debug('[Development] Keyboard shortcuts registered.');
    }
  }


  /**
   * Pre-loads the next photo in the collection. In development, additionally
   * pre-loads the previous photo in the collection.
   */
  private async preloadNeighboringPhotos() {
    const nextPhoto = this.state.photos[modIndex(this.state.index + 1, this.state.photos)];

    const promises = [preloadImage(nextPhoto.urls.full)];

    if (process.env.NODE_ENV === 'development') {
      const prevPhoto = this.state.photos[modIndex(this.state.index - 1, this.state.photos)];
      promises.push(preloadImage(prevPhoto.urls.full));
    }

    return Promise.all(promises);
  }


  /**
   * Returns the photo that render() should use. This is normally the current
   * index in the component's photos array, but in development, this will return
   * a 'mock' UnsplashPhotoResource by reading the "src" query param.
   */
  private getPhoto(): UnsplashPhotoResource {
    if (process.env.NODE_ENV === 'development' && queryString().src) {
      return {
        id: 'SRC',
        color: 'black',
        urls: {
          full: String(queryString().src)
        }
      } as UnsplashPhotoResource;
    }

    return this.state.photos[this.state.index];
  }


  /**
   * Bind the left/right arrow keys to handlers that will cycle through photos.
   */
  async componentDidMount() {
    try {
      const photos = await getPhotos();

      // Using the number of days since the Unix epoch, use modIndex to
      // calculate the current index in the photo collection.
      const index = modIndex(sinceEpoch('days'), photos);

      if (process.env.NODE_ENV === 'development') {
        console.debug(`[Splash] Loaded ${photos.length} images. Initial index: ${index}.`);
      }

      this.setState(prevState => ({...prevState, photos, index}));
      this.enableKeyboardShortcuts();
    } catch (err) {
      console.error('[Splash] Error:', err.message);
    }
  }


  /**
   * Whenever the component updates, preload the adjacent photos in the
   * collection.
   */
  async componentDidUpdate() {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[Splash] Preloading photos.');
    }

    await this.preloadNeighboringPhotos();

    if (process.env.NODE_ENV === 'development') {
      console.debug('[Splash] Finished preloading photos.');
    }
  }


  /**
   * Renders the component.
   */
  render() {
    // Use modIndex() here because the current index might be out-of-bounds if
    // navigating between photos in development.
    const photo = this.getPhoto();

    // If in development, enable the swatch when "swatch=true" is in the query.
    const showSwatch = process.env.NODE_ENV === 'development' && queryString().swatch === 'true';

    // If the photo collection hasnt loaded yet, return an empty div.
    if (!photo) {
      return <div></div>;
    }

    // In development, log information about the current photo.
    if (process.env.NODE_ENV === 'development') {
      console.groupCollapsed(`[Splash] Current photo ID: "${photo.id}"`);
      console.debug(photo);
      console.groupEnd();
    }

    const backgroundImage = photo.urls.full;
    const color = photo.color;

    // Load any CSS overrides for the current photo.
    const PhotoOverrides = (BACKGROUND_RULE_OVERRIDES[photo.id] || {});

    // Hit the download API to track a download for the current photo.
    // client.get('/download', {params: {id: photo.id}}).then(() => {
    //   if (process.env.NODE_ENV === 'development') {
    //     console.debug(`[Splash] Download tracked for photo ${photo.id}.`);
    //   }
    // });

    return (
      <PhotoContext.Provider value={photo}>
        {showSwatch ? <Swatch color={color} /> : null}
        <StyledSplash backgroundImage={backgroundImage} maskColor={photo.color} {...PhotoOverrides}>
          <SplashMid></SplashMid>
          <SplashLower />
        </StyledSplash>
      </PhotoContext.Provider>
    );
  }
}
