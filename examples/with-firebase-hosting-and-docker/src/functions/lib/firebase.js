import admin from 'firebase-admin';
import * as functions from 'firebase-functions';

export { functions };
export const firebase = admin.initializeApp();
