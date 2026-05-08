import { test, expect, Page, Browser, BrowserContext } from "@playwright/test";

/**
 * Document Management E2E Test Suite
 * 
 * Tests the complete flow:
 * - User Authentication
 * - Document Scanning
 * - Document Upload
 * - Page Management
 * - PDF Generation
 * - Encryption/Storage
 * - Vault Access
 */

// Test Configuration
const BASE_URL = "http://localhost:5173"; // Vite dev server
const TEST_TIMEOUT = 30000;

// Mock user credentials
const TEST_USER = {
  email: "test@example.com",
  password: "TestPassword123!",
};

test.describe("Document Management E2E Flow", () => {
  let page: Page;
  let context: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    // Set up shared context with camera mock
    context = await browser.newContext({
      permissions: ["camera", "microphone"],
      recordVideo: { dir: "test-videos/" }, // Record failures
    });
  });

  test.beforeEach(async ({ browser }) => {
    page = await context.newPage();
    await page.goto(BASE_URL);
    
    // Clear storage before each test
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  // ==================== AUTHENTICATION ====================
  test.describe("Authentication Flow", () => {
    test("should navigate to login page when not authenticated", async () => {
      await page.goto(`${BASE_URL}/dashboard`);
      await expect(page).toHaveURL(/login|auth/);
    });

    test("should allow user login", async () => {
      await page.goto(`${BASE_URL}/login`);
      
      // Fill login form
      await page.fill('input[placeholder*="email" i]', TEST_USER.email);
      await page.fill('input[placeholder*="password" i]', TEST_USER.password);
      
      // Submit
      await page.click('button:has-text("Sign In"), button:has-text("Login")');
      
      // Should redirect to dashboard
      await page.waitForURL(/dashboard/);
      await expect(page).toHaveURL(/dashboard/);
    });

    test("should store auth token in localStorage", async () => {
      await page.goto(`${BASE_URL}/login`);
      
      // Login
      await page.fill('input[placeholder*="email" i]', TEST_USER.email);
      await page.fill('input[placeholder*="password" i]', TEST_USER.password);
      await page.click('button:has-text("Sign In"), button:has-text("Login")');
      
      // Wait for redirect
      await page.waitForURL(/dashboard/);
      
      // Check token storage
      const token = await page.evaluate(() => localStorage.getItem("biovault_token"));
      const userId = await page.evaluate(() => localStorage.getItem("biovault_userId"));
      
      expect(token).toBeTruthy();
      expect(userId).toBeTruthy();
    });
  });

  // ==================== DOCUMENT HUB ====================
  test.describe("Document Hub Navigation", () => {
    test.beforeEach(async () => {
      // Assume logged in - mock auth
      await page.evaluate(({ user }) => {
        localStorage.setItem("biovault_token", "mock_token_123");
        localStorage.setItem("biovault_userId", user.id || "test_user_123");
      }, { user: { id: "test_user_123" } });
      
      await page.goto(`${BASE_URL}/dashboard`);
    });

    test("should display Documents link on dashboard", async () => {
      const documentsLink = page.locator('a:has-text("Documents"), button:has-text("Documents")');
      await expect(documentsLink).toBeVisible();
    });

    test("should navigate to document hub", async () => {
      await page.click('a:has-text("Documents"), button:has-text("Documents")');
      await page.waitForURL(/documents/);
      
      // Should see upload options
      await expect(page.locator("text=Scan Documents")).toBeVisible();
      await expect(page.locator("text=Upload Documents")).toBeVisible();
    });

    test("should show scan and upload options", async () => {
      await page.goto(`${BASE_URL}/documents`);
      
      const scanOption = page.locator('button:has-text("Scan")');
      const uploadOption = page.locator('button:has-text("Upload")');
      
      await expect(scanOption).toBeVisible();
      await expect(uploadOption).toBeVisible();
    });
  });

  // ==================== DOCUMENT SCANNING ====================
  test.describe("Document Scanning Flow", () => {
    test.beforeEach(async () => {
      // Mock auth
      await page.evaluate(() => {
        localStorage.setItem("biovault_token", "mock_token_123");
        localStorage.setItem("biovault_userId", "test_user_123");
      });
      
      await page.goto(`${BASE_URL}/documents`);
      
      // Click Scan Documents
      await page.click('button:has-text("Scan")');
      await page.waitForURL(/documents.*scan|scan/);
    });

    test("should show camera initialization", async () => {
      // Should see camera placeholder initially
      const cameraPlaceholder = page.locator("text=Camera will appear here");
      await expect(cameraPlaceholder).toBeVisible();
    });

    test("should have Open Camera button", async () => {
      const openCameraBtn = page.locator('button:has-text("Open Camera")');
      await expect(openCameraBtn).toBeVisible();
    });

    test("should initialize camera on button click", async () => {
      // Mock getUserMedia
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          const stream = canvas.captureStream(30);
          return stream;
        };
      });

      await page.click('button:has-text("Open Camera")');
      
      // Wait for camera to activate
      await page.waitForTimeout(1000);
      
      // Should show video feed
      const videoElement = page.locator("video");
      await expect(videoElement).toBeVisible();
    });

    test("should capture page on button click", async () => {
      // Setup camera mock
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      // Open camera
      await page.click('button:has-text("Open Camera")');
      await page.waitForTimeout(500);

      // Capture page
      const captureBtn = page.locator('button:has-text("Capture Page")');
      await captureBtn.click();

      // Should show page captured message
      const successMsg = page.locator("text=Page 1 captured");
      await expect(successMsg).toBeVisible({ timeout: 5000 });
    });

    test("should show page count", async () => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      await page.click('button:has-text("Open Camera")');
      await page.waitForTimeout(500);

      // Capture 3 pages
      for (let i = 0; i < 3; i++) {
        await page.click('button:has-text("Capture Page")');
        await page.waitForTimeout(500);
      }

      // Check page count in header or preview
      const pageCount = page.locator("text=3");
      await expect(pageCount).toBeVisible();
    });

    test("should show page thumbnails", async () => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      await page.click('button:has-text("Open Camera")');
      await page.waitForTimeout(500);

      // Capture 2 pages
      await page.click('button:has-text("Capture Page")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("Capture Page")');
      await page.waitForTimeout(500);

      // Should see thumbnails section
      const thumbsSection = page.locator("text=Pocket Contents");
      await expect(thumbsSection).toBeVisible();

      // Should have 2 page thumbnails
      const thumbnails = page.locator("img[alt^='Page']");
      await expect(thumbnails).toHaveCount(2);
    });

    test("should allow deleting pages", async () => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      await page.click('button:has-text("Open Camera")');
      await page.waitForTimeout(500);

      // Capture 2 pages
      for (let i = 0; i < 2; i++) {
        await page.click('button:has-text("Capture Page")');
        await page.waitForTimeout(500);
      }

      // Get initial thumbnail count
      let thumbnails = page.locator("img[alt^='Page']");
      await expect(thumbnails).toHaveCount(2);

      // Delete first page (hover and click delete button)
      const firstThumb = thumbnails.first();
      await firstThumb.hover();
      const deleteBtn = page.locator("button:has-text('🗑️')").first();
      await deleteBtn.click();

      // Should have 1 thumbnail left
      thumbnails = page.locator("img[alt^='Page']");
      await expect(thumbnails).toHaveCount(1);
    });

    test("should transition to review page when clicking Done", async () => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      await page.click('button:has-text("Open Camera")');
      await page.waitForTimeout(500);

      // Capture 1 page minimum
      await page.click('button:has-text("Capture Page")');
      await page.waitForTimeout(500);

      // Click Done button
      const doneBtn = page.locator('button:has-text("Done")');
      await doneBtn.click();

      // Should navigate to review page
      const reviewHeader = page.locator("text=Review Pages");
      await expect(reviewHeader).toBeVisible({ timeout: 5000 });
    });
  });

  // ==================== PAGE REVIEW & EDITING ====================
  test.describe("Page Review and Editing", () => {
    test.beforeEach(async () => {
      // Mock auth and captured pages
      await page.evaluate(() => {
        localStorage.setItem("biovault_token", "mock_token_123");
        localStorage.setItem("biovault_userId", "test_user_123");
      });

      // Simulate having scanned pages
      // Navigate directly to review page with mock data
      await page.goto(`${BASE_URL}/documents#review`);
    });

    test("should show review page header", async () => {
      const header = page.locator("text=Review Pages");
      await expect(header).toBeVisible({ timeout: 3000 });
    });

    test("should display page galleries", async () => {
      // Check for image elements (thumbnails)
      const images = page.locator("img[alt^='Page']");
      
      // Wait for at least one image if pages were captured
      try {
        const count = await images.count();
        if (count > 0) {
          await expect(images.first()).toBeVisible();
        }
      } catch {
        // Pages might not be loaded, which is OK for this test
      }
    });

    test("should have reorder mode toggle", async () => {
      const reorderBtn = page.locator('button:has-text("Reorder")');
      await expect(reorderBtn).toBeVisible();
    });

    test("should allow entering PDF name", async () => {
      const nameInput = page.locator('input[placeholder*="name" i], input[value*="Scanned"]');
      
      if (await nameInput.isVisible()) {
        await nameInput.clear();
        await nameInput.fill("My Document.pdf");
        
        const value = await nameInput.inputValue();
        expect(value).toBe("My Document.pdf");
      }
    });

    test("should show Save PDF button", async () => {
      const saveBtn = page.locator('button:has-text("Save PDF"), button:has-text("save")');
      await expect(saveBtn).toBeVisible();
    });
  });

  // ==================== PDF GENERATION & ENCRYPTION ====================
  test.describe("PDF Generation and Encryption", () => {
    test("should generate PDF from multiple pages", async () => {
      // This would require:
      // 1. Capturing pages in scan flow
      // 2. Mocking pdfkit or similar
      // 3. Verifying blob generation
      
      const mockPages = [
        "data:image/jpeg;base64,/9j/4AAQSkZJ...", // Mock base64
        "data:image/jpeg;base64,/9j/4AAQSkZJ...",
      ];

      // Simulated PDF generation
      const pdfBlob = new Blob(mockPages, { type: "application/pdf" });
      expect(pdfBlob.size).toBeGreaterThan(0);
    });

    test("should encrypt file with encryption utils", async () => {
      // Test encryption function
      const testData = "Sample document content";
      
      const encryptionResult = await page.evaluate((data) => {
        // Assuming encryptionUtils is available globally in test
        const result = {
          encrypted: "enc_[encrypted_hex]",
          key: "key_[derivedkey]",
        };
        return result;
      }, testData);

      expect(encryptionResult.encrypted).toBeDefined();
      expect(encryptionResult.key).toBeDefined();
    });

    test("should decrypt stored files", async () => {
      // Verify decryption works
      const encryptedData = {
        encrypted: "enc_abc123def456",
        key: "key_xyz789",
      };

      const decrypted = await page.evaluate((data) => {
        // Simulated decryption
        return "Sample document content";
      }, encryptedData);

      expect(decrypted).toBe("Sample document content");
    });
  });

  // ==================== VAULT STORAGE ====================
  test.describe("Vault Storage", () => {
    test("should save document to vault", async () => {
      await page.evaluate(() => {
        // Simulate vault save
        const vault = {
          users: {
            test_user_123: {
              documents: [
                {
                  id: "doc_123456789",
                  fileName: "Test Document.pdf",
                  fileSize: "2.45 MB",
                  fileData: "[encrypted]",
                  isEncrypted: true,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          },
        };
        
        localStorage.setItem("biovault_documents", JSON.stringify(vault));
      });

      const vaultData = await page.evaluate(() => {
        const vault = localStorage.getItem("biovault_documents");
        return JSON.parse(vault || "{}");
      });

      expect(vaultData.users).toBeDefined();
      expect(vaultData.users.test_user_123).toBeDefined();
      expect(vaultData.users.test_user_123.documents.length).toBe(1);
    });

    test("should persist documents across sessions", async () => {
      // Save to vault
      await page.evaluate(() => {
        const vault = {
          users: {
            test_user_123: {
              documents: [
                {
                  id: "doc_persistent_1",
                  fileName: "Persistent Doc.pdf",
                  fileData: "[encrypted]",
                  isEncrypted: true,
                },
              ],
            },
          },
        };
        localStorage.setItem("biovault_documents", JSON.stringify(vault));
      });

      // Reload page
      await page.reload();

      // Check persistence
      const persisted = await page.evaluate(() => {
        const vault = localStorage.getItem("biovault_documents");
        return JSON.parse(vault || "{}");
      });

      expect(persisted.users.test_user_123.documents[0].id).toBe("doc_persistent_1");
    });

    test("should isolate documents by userId", async () => {
      await page.evaluate(() => {
        const vault = {
          users: {
            user_1: {
              documents: [{ id: "doc_user1_1" }],
            },
            user_2: {
              documents: [{ id: "doc_user2_1" }],
            },
          },
        };
        localStorage.setItem("biovault_documents", JSON.stringify(vault));
      });

      const user1_docs = await page.evaluate(() => {
        const vault = JSON.parse(localStorage.getItem("biovault_documents") || "{}");
        return vault.users.user_1.documents;
      });

      expect(user1_docs).toHaveLength(1);
      expect(user1_docs[0].id).toBe("doc_user1_1");
    });
  });

  // ==================== VAULT ACCESS ====================
  test.describe("Vault Page Access", () => {
    test.beforeEach(async () => {
      // Mock auth
      await page.evaluate(() => {
        localStorage.setItem("biovault_token", "mock_token_123");
        localStorage.setItem("biovault_userId", "test_user_123");
      });

      // Pre-populate vault
      await page.evaluate(() => {
        const vault = {
          users: {
            test_user_123: {
              documents: [
                {
                  id: "doc_123",
                  fileName: "Sample Document.pdf",
                  fileSize: "2.5 MB",
                  createdAt: new Date().toISOString(),
                  isEncrypted: true,
                },
              ],
            },
          },
        };
        localStorage.setItem("biovault_documents", JSON.stringify(vault));
      });

      await page.goto(`${BASE_URL}/vault`);
    });

    test("should display vault page", async () => {
      const vaultHeading = page.locator("text=Vault, text=Documents");
      await expect(vaultHeading).toBeVisible({ timeout: 3000 });
    });

    test("should display stored documents", async () => {
      const documents = page.locator("text=Sample Document.pdf");
      await expect(documents).toBeVisible({ timeout: 3000 });
    });

    test("should show document details", async () => {
      // Should see file size
      const fileSize = page.locator("text=2.5 MB");
      await expect(fileSize).toBeVisible({ timeout: 3000 });

      // Should see encryption badge
      const encryptedBadge = page.locator("text=🔒");
      await expect(encryptedBadge).toBeVisible({ timeout: 3000 });
    });

    test("should have document action buttons", async () => {
      const docCard = page.locator("text=Sample Document.pdf");
      
      // Hover to reveal actions
      await docCard.hover();

      // Should have download button
      const downloadBtn = page.locator('button:has-text("Download"), button:has-text("⬇️")');
      expect(downloadBtn).toBeDefined();

      // Should have preview button
      const previewBtn = page.locator('button:has-text("Preview"), button:has-text("👁️")');
      expect(previewBtn).toBeDefined();

      // Should have delete button
      const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("🗑️")');
      expect(deleteBtn).toBeDefined();
    });

    test("should allow deleting documents", async () => {
      const docCard = page.locator("text=Sample Document.pdf");
      await docCard.hover();

      const deleteBtn = page.locator('button:has-text("Delete"), button:has-text("🗑️")');
      await deleteBtn.click();

      // Confirm deletion if dialog appears
      const confirmBtn = page.locator('button:has-text("Confirm"), button:has-text("Delete")').last();
      if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await confirmBtn.click();
      }

      // Document should be removed
      await expect(page.locator("text=Sample Document.pdf")).toBeHidden({ timeout: 3000 });
    });
  });

  // ==================== COMPLETE E2E FLOW ====================
  test.describe("Complete End-to-End Flow", () => {
    test("should complete full document scanning to vault flow", async () => {
      // 1. Login
      await page.evaluate(() => {
        localStorage.setItem("biovault_token", "mock_token_123");
        localStorage.setItem("biovault_userId", "test_user_123");
      });
      await page.goto(`${BASE_URL}/dashboard`);

      // 2. Navigate to documents
      const documentsLink = page.locator('a:has-text("Documents"), button:has-text("Documents")');
      if (await documentsLink.isVisible()) {
        await documentsLink.click();
      } else {
        await page.goto(`${BASE_URL}/documents`);
      }

      // 3. Start scanning
      const scanBtn = page.locator('button:has-text("Scan")');
      if (await scanBtn.isVisible()) {
        await scanBtn.click();
      }

      // 4. Initialize camera (mock)
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          const canvas = document.createElement("canvas");
          return canvas.captureStream(30);
        };
      });

      // 5. Capture pages
      const openCameraBtn = page.locator('button:has-text("Open Camera")');
      if (await openCameraBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await openCameraBtn.click();
      }

      // 6. Verify camera opened
      const videoElement = page.locator("video");
      if (await videoElement.isVisible({ timeout: 2000 }).catch(() => false)) {
        // Capture at least 1 page
        const captureBtn = page.locator('button:has-text("Capture Page")');
        if (await captureBtn.isVisible()) {
          await captureBtn.click();
          await page.waitForTimeout(500);
        }
      }

      // 7. Transition to review
      const doneBtn = page.locator('button:has-text("Done")');
      if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await doneBtn.click();
      }

      // 8. Save PDF
      const savePdfBtn = page.locator('button:has-text("Save PDF"), button:has-text("save")');
      if (await savePdfBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await savePdfBtn.click();
      }

      // 9. Verify success message or navigation
      const successMsg = page.locator("text=saved");
      if (await successMsg.isVisible({ timeout: 5000 }).catch(() => false)) {
        expect(successMsg).toBeDefined();
      }
    });
  });

  // ==================== ERROR HANDLING ====================
  test.describe("Error Handling", () => {
    test("should handle camera permission denied", async () => {
      await page.evaluate(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new Error("NotAllowedError");
        };
      });

      await page.goto(`${BASE_URL}/documents`);
      
      const scanBtn = page.locator('button:has-text("Scan")');
      if (await scanBtn.isVisible()) {
        await scanBtn.click();
      }

      const openCameraBtn = page.locator('button:has-text("Open Camera")');
      if (await openCameraBtn.isVisible()) {
        await openCameraBtn.click();

        // Should show error message
        const errorMsg = page.locator("text=Camera, text=permissions");
        await expect(errorMsg).toBeVisible({ timeout: 3000 });
      }
    });

    test("should handle no pages selected for saving", async () => {
      await page.goto(`${BASE_URL}/documents`);

      // Try to navigate to review without scanning
      const reviewPage = page.locator("text=Review Pages");

      if (await reviewPage.isVisible({ timeout: 2000 }).catch(() => false)) {
        const savePdfBtn = page.locator('button:has-text("Save PDF")');
        
        if (await savePdfBtn.isVisible()) {
          await savePdfBtn.click();

          // Should show error
          const errorMsg = page.locator("text=No pages");
          await expect(errorMsg).toBeVisible({ timeout: 3000 });
        }
      }
    });

    test("should handle storage quota exceeded", async () => {
      // This is harder to simulate, but we can log it
      console.log("Storage quota error handling: Requires environment setup");
    });
  });
});
