/**
 * Document Management E2E Testing Utilities
 * 
 * Provides helper functions for testing encryption, vault operations,
 * and document management features.
 */

import { Page, expect } from "@playwright/test";

// ==================== AUTHENTICATION HELPERS ====================

export async function mockAuthenticatedUser(page: Page, userId: string = "test_user_123") {
  await page.evaluate(({ uid }) => {
    localStorage.setItem("biovault_token", "mock_token_" + uid);
    localStorage.setItem("biovault_userId", uid);
  }, { uid: userId });
}

export async function getAuthToken(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem("biovault_token"));
}

export async function getUserId(page: Page): Promise<string | null> {
  return page.evaluate(() => localStorage.getItem("biovault_userId"));
}

export async function clearAuth(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("biovault_token");
    localStorage.removeItem("biovault_userId");
  });
}

// ==================== VAULT HELPERS ====================

export interface StoredDocument {
  id: string;
  fileName: string;
  fileType: "pdf" | "image" | "document";
  fileSize: string;
  fileData: string; // Encrypted
  encryptionKey: string;
  createdAt: string;
  isEncrypted: boolean;
  metadata?: {
    pages?: number;
    source?: "scan" | "upload";
    tags?: string[];
  };
}

export interface VaultState {
  users: {
    [userId: string]: {
      documents: StoredDocument[];
    };
  };
}

export async function initializeMockVault(page: Page, userId: string): Promise<VaultState> {
  const vault: VaultState = {
    users: {
      [userId]: {
        documents: [],
      },
    },
  };

  await page.evaluate(({ data }) => {
    localStorage.setItem("biovault_documents", JSON.stringify(data));
  }, { data: vault });

  return vault;
}

export async function getVault(page: Page): Promise<VaultState | null> {
  const vaultJson = await page.evaluate(() => {
    return localStorage.getItem("biovault_documents");
  });

  return vaultJson ? JSON.parse(vaultJson) : null;
}

export async function addDocumentToVaultStorage(
  page: Page,
  userId: string,
  document: StoredDocument
): Promise<VaultState> {
  let vault = await getVault(page);

  if (!vault) {
    vault = await initializeMockVault(page, userId);
  }

  if (!vault.users[userId]) {
    vault.users[userId] = { documents: [] };
  }

  vault.users[userId].documents.push(document);

  await page.evaluate(({ data }) => {
    localStorage.setItem("biovault_documents", JSON.stringify(data));
  }, { data: vault });

  return vault;
}

export async function getDocumentCount(page: Page, userId: string): Promise<number> {
  const vault = await getVault(page);
  return vault?.users[userId]?.documents.length || 0;
}

export async function getDocumentById(
  page: Page,
  userId: string,
  docId: string
): Promise<StoredDocument | null> {
  const vault = await getVault(page);
  return vault?.users[userId]?.documents.find((d) => d.id === docId) || null;
}

export async function deleteDocumentFromVault(
  page: Page,
  userId: string,
  docId: string
): Promise<boolean> {
  let vault = await getVault(page);

  if (!vault?.users[userId]) return false;

  const initialCount = vault.users[userId].documents.length;
  vault.users[userId].documents = vault.users[userId].documents.filter((d) => d.id !== docId);

  const deleted = initialCount > vault.users[userId].documents.length;

  if (deleted) {
    await page.evaluate(({ data }) => {
      localStorage.setItem("biovault_documents", JSON.stringify(data));
    }, { data: vault });
  }

  return deleted;
}

export async function clearVault(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("biovault_documents");
  });
}

// ==================== ENCRYPTION HELPERS ====================

export interface EncryptionResult {
  encrypted: string;
  key: string;
  iv?: string;
  salt?: string;
}

export async function createMockEncryptedDocument(
  page: Page,
  fileName: string,
  pageCount: number = 1
): Promise<StoredDocument> {
  const docId = `doc_${Date.now()}`;

  return {
    id: docId,
    fileName: fileName,
    fileType: "pdf",
    fileSize: `${(pageCount * 0.8 + 1.2).toFixed(2)} MB`,
    fileData: `enc_mock_encrypted_content_${docId}_${Math.random().toString(36).substr(2, 9)}`,
    encryptionKey: `key_mock_encryption_key_${docId}_${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    isEncrypted: true,
    metadata: {
      pages: pageCount,
      source: "scan",
      tags: [],
    },
  };
}

export async function verifyDocumentEncryption(
  page: Page,
  userId: string,
  docId: string
): Promise<{
  isEncrypted: boolean;
  hasEncryptionKey: boolean;
  encryptedDataFormat: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  const doc = await getDocumentById(page, userId, docId);

  if (!doc) {
    errors.push("Document not found");
    return { isEncrypted: false, hasEncryptionKey: false, encryptedDataFormat: false, errors };
  }

  const results = {
    isEncrypted: doc.isEncrypted,
    hasEncryptionKey: !!doc.encryptionKey,
    encryptedDataFormat: doc.fileData.startsWith("enc_"),
    errors,
  };

  // Validate encryption
  if (!results.isEncrypted) {
    errors.push("Document not marked as encrypted");
  }
  if (!results.hasEncryptionKey) {
    errors.push("Encryption key missing");
  }
  if (!results.encryptedDataFormat) {
    errors.push("Encrypted data format invalid (should start with 'enc_')");
  }

  return results;
}

export async function verifyDocumentRandomness(
  page: Page,
  userId: string,
  doc1Id: string,
  doc2Id: string
): Promise<{
  differentKeys: boolean;
  differentCiphertexts: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  const doc1 = await getDocumentById(page, userId, doc1Id);
  const doc2 = await getDocumentById(page, userId, doc2Id);

  if (!doc1) errors.push(`Document ${doc1Id} not found`);
  if (!doc2) errors.push(`Document ${doc2Id} not found`);

  if (errors.length > 0) {
    return { differentKeys: false, differentCiphertexts: false, errors };
  }

  const results = {
    differentKeys: doc1!.encryptionKey !== doc2!.encryptionKey,
    differentCiphertexts: doc1!.fileData !== doc2!.fileData,
    errors,
  };

  if (!results.differentKeys) {
    errors.push("Encryption keys should be different for different documents");
  }
  if (!results.differentCiphertexts) {
    errors.push("Ciphertexts should be different (due to random IV/salt)");
  }

  return results;
}

// ==================== DOCUMENT CAPTURE HELPERS ====================

export async function mockCameraStream(page: Page) {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async (constraints: any) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;

      // Draw test pattern (blue rectangle)
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#0066cc";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.font = "30px Arial";
        ctx.fillText("TEST DOCUMENT", 100, 100);
      }

      return canvas.captureStream(30);
    };
  });
}

export async function mockCameraDenied(page: Page) {
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const error = new Error("Permission denied");
      Object.defineProperty(error, "name", { value: "NotAllowedError" });
      throw error;
    };
  });
}

export async function waitForCameraActive(page: Page, timeout: number = 5000): Promise<boolean> {
  try {
    await page.waitForSelector("video", { timeout });
    const videoElement = page.locator("video");
    return await videoElement.isVisible();
  } catch {
    return false;
  }
}

export async function captureDocumentPage(page: Page): Promise<boolean> {
  try {
    const captureBtn = page.locator('button:has-text("Capture Page")');

    if (!(await captureBtn.isVisible())) {
      return false;
    }

    await captureBtn.click();

    // Wait for capture message
    const successMsg = page.locator("text=Page").first();
    await expect(successMsg).toBeVisible({ timeout: 3000 });

    return true;
  } catch {
    return false;
  }
}

export async function getPageCount(page: Page): Promise<number> {
  const countText = await page
    .locator("text=/[0-9]+ pages|Pages captured/")
    .first()
    .textContent();

  const match = countText?.match(/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

export async function getCapturedPageCount(page: Page): Promise<number> {
  // Look for page thumbnails or counter
  const images = page.locator("img[alt^='Page']");
  return await images.count();
}

// ==================== NAVIGATION HELPERS ====================

export async function navigateToDocuments(page: Page, baseUrl: string = "http://localhost:5173") {
  await page.goto(`${baseUrl}/documents`);
  await expect(page.locator("text=Upload Options, text=Scan, text=Upload")).toBeDefined({
    timeout: 3000,
  });
}

export async function navigateToVault(page: Page, baseUrl: string = "http://localhost:5173") {
  await page.goto(`${baseUrl}/vault`);
  await expect(page.locator("text=Vault, text=Documents")).toBeDefined({ timeout: 3000 });
}

export async function navigateToDashboard(page: Page, baseUrl: string = "http://localhost:5173") {
  await page.goto(`${baseUrl}/dashboard`);
  await expect(page.locator("text=Dashboard")).toBeDefined({ timeout: 3000 });
}

// ==================== VALIDATION HELPERS ====================

export async function validateDocumentMetadata(doc: StoredDocument): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Validate ID
  if (!doc.id || !doc.id.startsWith("doc_")) {
    errors.push("Invalid document ID format");
  }

  // Validate fileName
  if (!doc.fileName || doc.fileName.length === 0) {
    errors.push("Document name is empty");
  }

  if (!doc.fileName.endsWith(".pdf")) {
    errors.push("Document should be PDF format");
  }

  // Validate fileSize
  if (!doc.fileSize || !doc.fileSize.includes("MB")) {
    errors.push("Invalid file size format");
  }

  // Validate encryption
  if (!doc.isEncrypted) {
    errors.push("Document should be marked as encrypted");
  }

  if (!doc.encryptionKey || doc.encryptionKey.length === 0) {
    errors.push("Encryption key is empty");
  }

  // Validate fileData
  if (!doc.fileData || !doc.fileData.startsWith("enc_")) {
    errors.push("Encrypted file data format invalid");
  }

  // Validate timestamp
  if (!doc.createdAt || isNaN(new Date(doc.createdAt).getTime())) {
    errors.push("Invalid creation timestamp");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function validateVaultStructure(vault: VaultState | null): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  if (!vault) {
    errors.push("Vault is null or undefined");
    return { valid: false, errors };
  }

  if (!vault.users || typeof vault.users !== "object") {
    errors.push("Vault.users is not an object");
  }

  for (const [userId, userData] of Object.entries(vault.users || {})) {
    if (!Array.isArray(userData.documents)) {
      errors.push(`User ${userId}: documents is not an array`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ==================== PERFORMANCE HELPERS ====================

export async function measureDocumentSaveTime(page: Page): Promise<number> {
  const startTime = Date.now();

  const saveBtn = page.locator('button:has-text("Save PDF")');
  await saveBtn.click();

  // Wait for success message
  await expect(page.locator("text=saved")).toBeVisible({ timeout: 5000 });

  return Date.now() - startTime;
}

export async function measureVaultLoadTime(page: Page, baseUrl: string = "http://localhost:5173"): Promise<number> {
  const startTime = Date.now();

  await page.goto(`${baseUrl}/vault`);
  await expect(page.locator("text=Vault")).toBeVisible({ timeout: 5000 });

  return Date.now() - startTime;
}

// ==================== ERROR SIMULATION ====================

export async function simulateStorageQuotaExceeded(page: Page) {
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === "biovault_documents") {
        throw new DOMException("QuotaExceededError", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    };
  });
}

export async function simulateNetworkOffline(page: Page) {
  // Use Playwright's context offline mode
  await page.context().setOffline(true);
}

export async function simulateNetworkOnline(page: Page) {
  await page.context().setOffline(false);
}

// ==================== ASSERTION HELPERS ====================

export async function expectDocumentInVault(
  page: Page,
  userId: string,
  fileName: string
): Promise<void> {
  const vault = await getVault(page);
  const found = vault?.users[userId]?.documents.some((d) => d.fileName === fileName);

  expect(found).toBeTruthy();
}

export async function expectDocumentNotInVault(
  page: Page,
  userId: string,
  fileName: string
): Promise<void> {
  const vault = await getVault(page);
  const found = vault?.users[userId]?.documents.some((d) => d.fileName === fileName);

  expect(found).toBeFalsy();
}

export async function expectEncryptedStorage(
  page: Page,
  userId: string,
  docId: string
): Promise<void> {
  const doc = await getDocumentById(page, userId, docId);

  expect(doc?.isEncrypted).toBe(true);
  expect(doc?.fileData).toMatch(/^enc_/);
  expect(doc?.encryptionKey).toBeDefined();
}

export async function expectValidStorageFormat(page: Page): Promise<void> {
  const vault = await getVault(page);
  const validation = await validateVaultStructure(vault);

  expect(validation.valid).toBe(true);
  expect(validation.errors.length).toBe(0);
}
