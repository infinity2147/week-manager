const API = "https://api.github.com";

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function createGitHub({ token, repo, branch = "main", path = "MANAGER.md", fetchImpl = fetch }) {
  if (!token) throw new Error("The GitHub token is not configured.");
  if (!repo || !repo.includes("/")) throw new Error(`Expected a GitHub repo as owner/name, received: ${repo}`);

  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "week-manager-worker",
    "x-github-api-version": "2022-11-28",
  };

  async function read() {
    const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`;
    const response = await fetchImpl(url, { headers });
    if (!response.ok) throw new Error(`Could not read ${path}: ${response.status}`);
    const body = await response.json();
    return { markdown: decodeBase64(body.content), sha: body.sha };
  }

  async function write(markdown, sha, message) {
    const url = `${API}/repos/${repo}/contents/${path}`;
    const response = await fetchImpl(url, {
      method: "PUT",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ message, content: encodeBase64(markdown), sha, branch }),
    });
    if (response.status === 409 || response.status === 422) {
      const error = new Error("MANAGER.md changed since it was read.");
      error.conflict = true;
      throw error;
    }
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      if (response.status === 403 || response.status === 404) {
        throw new Error(
          `GitHub refused the write (${response.status}). The token usually needs "Contents: Read and write" on ${repo}. ${detail.slice(0, 160)}`,
        );
      }
      throw new Error(`Could not write ${path}: ${response.status} ${detail.slice(0, 160)}`);
    }
    const body = await response.json();
    return { sha: body.content.sha };
  }

  return { read, write };
}

/**
 * Reads MANAGER.md, applies `mutate` to it, and commits the result. On a
 * conflicting write it re-reads and re-applies once, which is safe because
 * operations are semantic rather than textual.
 */
export async function commitWithRetry(github, mutate, message) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { markdown, sha } = await github.read();
    const next = mutate(markdown);
    if (next === markdown) return { markdown, changed: false };
    try {
      await github.write(next, sha, message);
      return { markdown: next, changed: true };
    } catch (error) {
      if (!error.conflict || attempt === 1) throw error;
    }
  }
  throw new Error("Could not publish the update after a retry.");
}
