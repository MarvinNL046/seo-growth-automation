export interface SiteProfile {
  schemaVersion: 1;
  domain: string;
  niche: string;
  locale: {
    id: string;
    locationCode: number;
    languageCode: string;
    marketLabel: string;
  };
  repository: {
    projectPath: string;
    remote: string;
    defaultBranch: string;
    productionBranch: string;
    hosting: string;
    rollbackDocumented: boolean;
  };
  publicationPolicy: {
    mode: "pr-only";
    permanentPrOnly: boolean;
    initialPrOnlyRuns: number;
    maxActionsPerRun: 1;
  };
  measurement: {
    gscStatus: "configured" | "export-only" | "unavailable";
    gscProperty: string;
    baselineWindowsDays: [28, 56];
  };
  dataForSEO: {
    seedKeywords: string[];
    minSearchVolume: number;
    maxKeywordDifficulty: number;
    ideaLimit: number;
    subjectPattern: string;
    excludePattern: string;
    deepValidationMinimum: number;
  };
  commands: {
    install: string;
    test: string;
    typecheck?: string;
    build: string;
    renderedHtml?: string;
    lighthouse?: string;
  };
  sourcePolicy: {
    ymyl: boolean;
    primarySourceRequired: boolean;
    preferredDomains: string[];
    forbiddenClaims: string[];
  };
  notes?: string[];
}

export interface DataForSeoTask {
  id?: string;
  status_code?: number;
  status_message?: string;
  cost?: number;
  data?: Record<string, unknown>;
  result?: Array<Record<string, unknown>>;
}

export interface DataForSeoResponse {
  status_code?: number;
  status_message?: string;
  tasks_error?: number;
  tasks?: DataForSeoTask[];
}
