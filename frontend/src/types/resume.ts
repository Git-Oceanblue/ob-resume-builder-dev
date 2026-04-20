export interface Education {
  degree: string;
  areaOfStudy: string;
  school: string;
  location: string;
  date: string;
  wasAwarded: boolean;
}

export interface Certification {
  name: string;
  issuedBy: string;
  dateObtained: string;
  certificationNumber: string;
  expirationDate: string;
}

export interface Project {
  projectName: string;
  projectLocation: string;
  projectResponsibilities: string[];
  keyTechnologies: string;
  period: string;
}

export interface Subsection {
  title: string;
  content: string[];
}

export interface EmploymentHistory {
  companyName: string;
  roleName: string;
  workPeriod: string;
  location: string;
  department: string;
  subRole: string;
  description: string;
  responsibilities: string[];
  projects: Project[];
  subsections: Subsection[];
  keyTechnologies: string;
}

export interface SkillSubcategory {
  name: string;
  skills: string[];
}

export interface SkillCategory {
  categoryName: string;
  skills: string[];
  subCategories: SkillSubcategory[];
}

export interface AgentTokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  processingTime: number;
}

export interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  agentBreakdown: Record<string, AgentTokenStats>;
}

export interface ResumeData {
  name: string;
  title: string;
  requisitionNumber: string;
  professionalSummary: string[];
  summarySections: Subsection[];
  subsections: Subsection[];
  employmentHistory: EmploymentHistory[];
  education: Education[];
  certifications: Certification[];
  technicalSkills: Record<string, string[]>;
  skillCategories: SkillCategory[];
  tokenStats?: TokenStats;
}

export type AgentStatus = 'pending' | 'running' | 'complete' | 'error';

export interface AgentInfo {
  status: AgentStatus;
  desc?: string;
  tokenStats?: AgentTokenStats;
  processingTime?: number;
}

export type AgentStatuses = Record<string, AgentInfo | AgentStatus>;
