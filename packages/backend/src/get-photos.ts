import env from '@darkobits/env';
import type { APIGatewayEvent } from 'aws-lambda';
import { InspiratPhotoResource } from 'inspirat-types';

import {
  AWSLambdaMiddleware,
  AWSLambdaHandlerFactory
} from 'lib/aws-lambda';
import {
  setCorsHeaders,
  setVersionHeader
} from 'lib/aws-lambda/middleware';
import { getJSON } from 'lib/aws-s3';


// ----- Get Photos ------------------------------------------------------------

/**
 * Returns a JSON array of all photos from S3.
 *
 * N.B. This not in use at the moment as clients now fetch directly from S3.
 * Keeping it in place in the event we need to perform any server-side
 * transforms in the future, though this is not likely.
 */
const handler: AWSLambdaMiddleware = async ({ response }) => {
  const stage = env<string>('STAGE', true);
  const bucket = `inspirat-${stage}`;
  const key = 'photoCollection';

  const photoCollection = await getJSON<Array<InspiratPhotoResource>>({ bucket, key });

  if (!photoCollection) {
    response.statusCode = 500;
    response.body = { message: 'Response from S3 did not contain any photos.' };
    return;
  }

  response.body = photoCollection;
};


export default AWSLambdaHandlerFactory<APIGatewayEvent>({
  pre: [
    setCorsHeaders,
    setVersionHeader
  ],
  handler
});
