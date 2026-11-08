// Supported ELD providers: what the connect form asks for and where to find it.
import * as samsara from './samsara.js';
import * as motive from './motive.js';
import * as geotab from './geotab.js';
import * as isaac from './isaac.js';
import * as sandbox from './sandbox.js';

export const ADAPTERS = { samsara, motive, geotab, isaac, sandbox };

export const PROVIDERS = [
  {
    id: 'samsara', name: 'Samsara', color: '#0B84FF', positions: true,
    fields: [
      { key: 'apiToken', label: 'API token', secret: true, placeholder: 'samsara_api_…' },
      { key: 'region', label: 'Region', options: [{ value: 'us', label: 'North America' }, { value: 'eu', label: 'Europe' }], default: 'us' },
    ],
    steps: ['In Samsara open Settings → API Tokens.', 'Add a token with read access to Vehicles, Drivers, ELD Hours of Service and Vehicle Statistics.', 'Paste the token here.'],
    webhook: true,
  },
  {
    id: 'motive', name: 'Motive', color: '#1F2937', positions: true,
    fields: [{ key: 'apiKey', label: 'API key', secret: true, placeholder: 'Motive API key' }],
    steps: ['In the Motive Fleet Dashboard open Admin → API Keys (account admins only).', 'Create a key and copy it.', 'Paste the key here.'],
    webhook: true,
  },
  {
    id: 'geotab', name: 'Geotab', color: '#25477B', positions: true,
    fields: [
      { key: 'server', label: 'Server', placeholder: 'my.geotab.com', default: 'my.geotab.com' },
      { key: 'database', label: 'Database', placeholder: 'your_company' },
      { key: 'userName', label: 'User', placeholder: 'rugo-api@yourcompany.com' },
      { key: 'password', label: 'Password', secret: true },
    ],
    steps: ['In MyGeotab create a service user for Rugo with read access to vehicles, drivers and HOS.', 'Enter your database name and that user’s sign-in.'],
    webhook: false,
  },
  {
    id: 'isaac', name: 'Isaac Instruments', color: '#E4002B', positions: true, beta: true,
    fields: [
      { key: 'baseUrl', label: 'API URL', placeholder: 'https://… (from Isaac)' },
      { key: 'apiKey', label: 'API key', secret: true },
    ],
    steps: ['Ask your Isaac account manager for partner API access.', 'Paste the API URL and key they send you.'],
    webhook: false,
  },
  {
    id: 'sandbox', name: 'Sandbox', color: '#8E8E93', positions: false, sandbox: true,
    fields: [],
    steps: ['Test data built from your own drivers and trucks. Use it to try the integration before connecting a real ELD.'],
    webhook: false,
  },
];

export const providerMeta = (id) => PROVIDERS.find((p) => p.id === id);
