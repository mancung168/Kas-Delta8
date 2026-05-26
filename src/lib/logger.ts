export const formatLogDetails = (details: string) => {
  return details.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
};
