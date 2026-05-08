// Portfolio Data Models and Utilities

export interface VaultDocument {
  id: string;
  name: string;
  encryptedData: string;
  encryptedImage?: string;
  cloudinaryUrl?: string;
  metadata: {
    timestamp: number;
    original_name: string;
    size: number;
    checksum: string;
    encrypted?: boolean;
    ownerId?: string;
  };
  createdAt: string;
}

export interface PortfolioSection {
  title: string;
  documents: string[]; // vault document IDs
}

export interface Portfolio {
  id: string;
  name: string;
  type: "academic" | "placement" | "masters" | "personal" | "professional";
  sections: PortfolioSection[];
  createdAt: string;
  views?: number;
  uniqueViewers?: number;
  shareToken?: string;
  shareExpiry?: string;
  updatedAt?: string;
  status?: "active" | "shared" | "draft";
  template?: string;
}

export interface PortfolioAccessLog {
  id: string;
  portfolioId: string;
  ipAddress: string;
  userAgent: string;
  timestamp: string;
  action: 'view' | 'download' | 'share' | 'delete';
  duration?: number;
  device?: string;
}

// Input type for creating new portfolios (without id and createdAt)
export interface CreatePortfolioInput {
  name: string;
  type: "academic" | "placement" | "masters" | "personal" | "professional";
  sections: {
    title: string;
    documents: string[];
  }[];
  template?: string;
  status?: "active" | "shared" | "draft";
}

// Profile data interface
export interface ProfileData {
  name: string;
  email: string;
  phone: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
}

// Function to get profile data from localStorage
export const getProfileData = (): ProfileData => {
  return JSON.parse(localStorage.getItem('userProfile') || '{}');
};

// Template configurations for intelligent portfolio creation
export const PORTFOLIO_TEMPLATES = {
  placement: {
    type: "placement" as const,
    sections: [
      "Profile",
      "Resume",
      "Projects",
      "Internships",
      "Skills",
      "Certifications",
      "Achievements"
    ]
  },
  masters: {
    type: "masters" as const,
    sections: [
      "Profile",
      "Academics & Transcripts",
      "Entrance Exams",
      "SOP & Essays",
      "LORs",
      "Experience & Research",
      "Financial Documents"
    ]
  },
  academic: {
    type: "academic" as const,
    sections: [
      "Profile",
      "Education",
      "Certificates",
      "Projects",
      "Documents"
    ]
  },
  personal: {
    type: "personal" as const,
    sections: [
      "Profile",
      "Documents",
      "Achievements"
    ]
  },
  professional: {
    type: "professional" as const,
    sections: [
      "Profile",
      "Resume",
      "Projects",
      "Experience",
      "Skills",
      "Certificates"
    ]
  }
};

// Utility function to generate default sections based on portfolio type
export const generateDefaultSections = (type: Portfolio['type']): PortfolioSection[] => {
  switch (type) {
    case "academic":
      return [
        { title: "Profile", documents: [] },
        { title: "Education", documents: [] },
        { title: "Certificates", documents: [] },
        { title: "Projects", documents: [] },
        { title: "Documents", documents: [] }
      ];
    
    case "placement":
      return [
        { title: "Resume", documents: [] },
        { title: "Projects", documents: [] },
        { title: "Skills", documents: [] },
        { title: "Internships", documents: [] },
        { title: "Certificates", documents: [] }
      ];
    
    case "masters":
      return [
        { title: "SOP", documents: [] },
        { title: "Resume", documents: [] },
        { title: "Academic Records", documents: [] },
        { title: "Test Scores", documents: [] },
        { title: "Certificates", documents: [] }
      ];
    
    case "personal":
      return [
        { title: "Profile", documents: [] },
        { title: "Documents", documents: [] },
        { title: "Achievements", documents: [] }
      ];
    
    case "professional":
      return [
        { title: "Profile", documents: [] },
        { title: "Resume", documents: [] },
        { title: "Projects", documents: [] },
        { title: "Experience", documents: [] },
        { title: "Skills", documents: [] },
        { title: "Certificates", documents: [] }
      ];
    
    default:
      return [
        { title: "Profile", documents: [] },
        { title: "Documents", documents: [] }
      ];
  }
};

// Utility function to create a new portfolio with default structure
export const createNewPortfolio = (
  name: string,
  type: Portfolio['type']
): CreatePortfolioInput => {
  return {
    name,
    type,
    sections: generateDefaultSections(type)
  };
};

// Type guard functions
export const isPortfolioType = (value: string): value is Portfolio['type'] => {
  return ["academic", "placement", "masters", "personal", "professional"].includes(value);
};

// Portfolio type display names
export const getPortfolioTypeDisplayName = (type: Portfolio['type']): string => {
  switch (type) {
    case "academic":
      return "Academic Portfolio";
    case "placement":
      return "Placement Portfolio";
    case "masters":
      return "Masters Portfolio";
    case "personal":
      return "Personal Portfolio";
    case "professional":
      return "Professional Portfolio";
    default:
      return "Portfolio";
  }
};

// Auto document classification function
export const classifyDocument = (fileName: string, portfolioType: Portfolio['type']): string => {
  const name = fileName.toLowerCase();
  const template = PORTFOLIO_TEMPLATES[portfolioType];
  
  // Classification based on file name patterns
  if (name.includes("resume") || name.includes("cv")) return "Resume";
  if (name.includes("project")) return "Projects";
  if (name.includes("cert") || name.includes("certificate")) return "Certifications";
  if (name.includes("intern")) return "Internships";
  if (name.includes("skill")) return "Skills";
  if (name.includes("achievement") || name.includes("award")) return "Achievements";
  if (name.includes("marks") || name.includes("transcript") || name.includes("grade")) return "Academics & Transcripts";
  if (name.includes("ielts") || name.includes("gre") || name.includes("toefl") || name.includes("sat")) return "Entrance Exams";
  if (name.includes("sop") || name.includes("essay") || name.includes("statement")) return "SOP & Essays";
  if (name.includes("lor") || name.includes("recommendation") || name.includes("reference")) return "LORs";
  if (name.includes("experience") || name.includes("research") || name.includes("work")) return "Experience & Research";
  if (name.includes("bank") || name.includes("itr") || name.includes("financial") || name.includes("income")) return "Financial Documents";
  if (name.includes("education") || name.includes("degree")) return "Education";
  if (name.includes("document")) return "Documents";

  // Return first available section if no match found
  return template.sections[0] || "Other";
};
