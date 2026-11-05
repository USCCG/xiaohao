// Narrow declarations for the documented winkNLP utility subpath APIs.
// Reconcile with upstream types after npm installation if they are provided.
declare module 'wink-nlp/utilities/similarity.js' {
  const similarity: {
    bow: { cosine(left: Record<string, number>, right: Record<string, number>): number };
  };
  export default similarity;
}
declare module '*.css' {}
