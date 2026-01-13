/**
 * Gère les fichiers en attente d'upload vers Cloudinary
 *
 * Permet d'utiliser des blob URLs pendant l'édition et d'uploader
 * tous les fichiers en une seule fois à la sauvegarde.
 */
export class PendingUploadsManager {
  /** Map blob URL → File original */
  private pending: Map<string, File> = new Map();

  /** Fonction d'upload (injectée pour découplage) */
  private uploadFn: (file: File) => Promise<string>;

  constructor(uploadFn: (file: File) => Promise<string>) {
    this.uploadFn = uploadFn;
  }

  /**
   * Ajoute un fichier en attente d'upload
   * @returns URL blob locale utilisable immédiatement
   */
  add(file: File): string {
    const blobUrl = URL.createObjectURL(file);
    this.pending.set(blobUrl, file);
    return blobUrl;
  }

  /**
   * Vérifie si une URL est un blob en attente
   */
  isPending(url: string): boolean {
    return this.pending.has(url);
  }

  /**
   * Vérifie si des fichiers sont en attente
   */
  hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * Nombre de fichiers en attente
   */
  get count(): number {
    return this.pending.size;
  }

  /**
   * Upload tous les fichiers en attente vers Cloudinary
   * @returns Map blob URL → Cloudinary URL
   */
  async uploadAll(): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    if (this.pending.size === 0) {
      return results;
    }

    // Upload en parallèle
    const entries = Array.from(this.pending.entries());
    const uploads = entries.map(async ([blobUrl, file]) => {
      const cloudinaryUrl = await this.uploadFn(file);
      return { blobUrl, cloudinaryUrl };
    });

    const uploaded = await Promise.all(uploads);

    // Construire la map de résultats et libérer les blob URLs
    for (const { blobUrl, cloudinaryUrl } of uploaded) {
      results.set(blobUrl, cloudinaryUrl);
      URL.revokeObjectURL(blobUrl);
      this.pending.delete(blobUrl);
    }

    return results;
  }

  /**
   * Remplace les blob URLs par les URLs Cloudinary dans un objet JSON
   * @param obj Objet contenant potentiellement des blob URLs (layers, etc.)
   * @param urlMap Map blob URL → Cloudinary URL
   * @returns Nouvel objet avec URLs remplacées
   */
  static replaceUrls<T>(obj: T, urlMap: Map<string, string>): T {
    if (urlMap.size === 0) return obj;

    const json = JSON.stringify(obj);
    let replaced = json;

    for (const [blobUrl, cloudinaryUrl] of urlMap) {
      // Escape les caractères spéciaux pour la regex
      const escaped = blobUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      replaced = replaced.replace(new RegExp(escaped, "g"), cloudinaryUrl);
    }

    return JSON.parse(replaced) as T;
  }

  /**
   * Nettoie toutes les ressources (blob URLs) sans uploader
   * À appeler si l'utilisateur abandonne
   */
  clear(): void {
    for (const blobUrl of this.pending.keys()) {
      URL.revokeObjectURL(blobUrl);
    }
    this.pending.clear();
  }
}
