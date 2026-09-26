import { buildFixtures } from './fixtures';

export default async function globalSetup(): Promise<void> {
  await buildFixtures();
}
