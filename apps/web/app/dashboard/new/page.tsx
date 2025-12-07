'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useApiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { CheckCircle2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

// Step Components
import { RepoSelectionStep } from '@/components/project-wizard/repo-selection-step';
import { EnvironmentVariablesStep } from '@/components/project-wizard/environment-variables-step';
import { ProjectDetailsStep } from '@/components/project-wizard/project-details-step';

type WizardStep = 'repo' | 'env' | 'details';

interface ProjectFormData {
  repositoryUrl: string;
  repositoryName: string;
  hasGitHubApp: boolean;
  environmentVariables: Array<{ key: string; value: string }>;
  projectName: string;
  deploymentType: 'TRIVX_RUNNER' | 'GITHUB_ACTIONS';
}

export default function CreateProjectWizard() {
  const [currentStep, setCurrentStep] = React.useState<WizardStep>('repo');
  const [isCreating, setIsCreating] = React.useState(false);
  const api = useApiClient();
  const router = useRouter();

  const [formData, setFormData] = React.useState<ProjectFormData>({
    repositoryUrl: '',
    repositoryName: '',
    hasGitHubApp: false,
    environmentVariables: [],
    projectName: '',
    deploymentType: 'TRIVX_RUNNER',
  });

  const steps: Array<{ id: WizardStep; title: string; description: string }> = [
    { id: 'repo', title: 'Select Repository', description: 'Choose a GitHub repository' },
    { id: 'env', title: 'Environment Variables', description: 'Add secrets (optional)' },
    { id: 'details', title: 'Project Details', description: 'Name your project' },
  ];

  const currentStepIndex = steps.findIndex(s => s.id === currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const handleNext = () => {
    if (currentStep === 'repo') setCurrentStep('env');
    else if (currentStep === 'env') setCurrentStep('details');
  };

  const handleBack = () => {
    if (currentStep === 'details') setCurrentStep('env');
    else if (currentStep === 'env') setCurrentStep('repo');
  };

  const handleSkipEnv = () => {
    setCurrentStep('details');
  };

  const handleCreateProject = async () => {
    try {
      setIsCreating(true);

      const orgsResponse = await api.get('/api/organizations');
      const orgs = orgsResponse.data.organizations || [];

      if (orgs.length === 0) {
        toast.error('No organization found. Please create one.');
        router.push('/onboarding/organization');
        return;
      }

      const orgId = orgs[0].id;

      const projectRes = await api.post('/api/projects', {
        name: formData.projectName,
        organizationId: orgId,
        repoUrl: formData.repositoryUrl,
        deploymentType: formData.deploymentType,
      });

      const projectId = projectRes.data.project.id;

      if (formData.environmentVariables.length > 0) {
        await Promise.all(
          formData.environmentVariables.map(env =>
            api.post(`/api/projects/${projectId}/secrets`, {
              key: env.key,
              value: env.value,
            })
          )
        );
      }

      toast.success('Project created successfully!');
      router.push(`/dashboard`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to create project');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Progress Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Create New Project</h1>
          <span className="text-sm text-muted-foreground">
            Step {currentStepIndex + 1} of {steps.length}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        
        {/* Step Indicators */}
        <div className="flex items-center justify-between mt-4">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    index <= currentStepIndex
                      ? 'bg-primary border-primary text-primary-foreground'
                      : 'border-muted text-muted-foreground'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className="text-center mt-2">
                  <p className="text-xs font-medium">{step.title}</p>
                  <p className="text-[10px] text-muted-foreground">{step.description}</p>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mx-2 ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <Card className="border-border/50 bg-card/50 backdrop-blur-xl">
        <CardContent className="pt-6">
          {currentStep === 'repo' && (
            <RepoSelectionStep
              value={formData.repositoryUrl}
              repositoryName={formData.repositoryName}
              hasGitHubApp={formData.hasGitHubApp}
              deploymentType={formData.deploymentType}
              onChange={(data) => setFormData(prev => ({ ...prev, ...data }))}
              onNext={handleNext}
            />
          )}

          {currentStep === 'env' && (
            <EnvironmentVariablesStep
              value={formData.environmentVariables}
              onChange={(envVars) => setFormData(prev => ({ ...prev, environmentVariables: envVars }))}
              onNext={handleNext}
              onSkip={handleSkipEnv}
              onBack={handleBack}
            />
          )}

          {currentStep === 'details' && (
            <ProjectDetailsStep
              projectName={formData.projectName}
              repositoryName={formData.repositoryName}
              onChange={(name) => setFormData(prev => ({ ...prev, projectName: name }))}
              onBack={handleBack}
              onCreate={handleCreateProject}
              isCreating={isCreating}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
