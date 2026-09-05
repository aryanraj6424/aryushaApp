import { OAuth2Client } from "google-auth-library";

const CLIENT_ID = "463458879565-t3e512uoqcns9920csa5fhar1o9mh13v.apps.googleusercontent.com";
const client = new OAuth2Client(CLIENT_ID);

/**
 * Verifies a Google ID token issued to our client.
 * @param {string} idToken  — the credential returned by Google Identity Services
 * @returns {{ email, name, picture, googleId }}
 * @throws if the token is invalid or was not issued for our client ID
 */
export async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: CLIENT_ID,
  });

  const payload = ticket.getPayload();

  return {
    email:    payload.email,
    name:     payload.name,
    picture:  payload.picture,
    googleId: payload.sub,
  };
}
