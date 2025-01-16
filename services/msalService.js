import { ConfidentialClientApplication } from '@azure/msal-node';
import dotenv from 'dotenv';

dotenv.config();

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`,
    clientSecret: process.env.AZURE_CLIENT_SECRET,
  }
};

const msalClient = new ConfidentialClientApplication(msalConfig);

// Application (client) level permissions for SharePoint/OneDrive access
const scopes = [
  'https://graph.microsoft.com/.default'
];

export const getAccessToken = async () => {
  try {
    const result = await msalClient.acquireTokenByClientCredential({
      scopes: scopes
    });
    
    if (!result?.accessToken) {
      throw new Error('No access token returned');
    }
    
    return result.accessToken;
  } catch (error) {
    console.error('Error acquiring token:', error);
    throw new Error(`Failed to acquire access token: ${error.message}`);
  }
};

export default {
  getAccessToken
};
