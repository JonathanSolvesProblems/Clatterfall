import { reddit } from '@devvit/web/server';

/** Creates the interactive post that shows the subreddit's communal machine. */
export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'Clatterfall: build the machine, one part a day',
  });
};
