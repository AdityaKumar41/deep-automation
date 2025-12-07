"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface EnvironmentVariablesStepProps {
  value: Array<{ key: string; value: string }>;
  onChange: (envVars: Array<{ key: string; value: string }>) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function EnvironmentVariablesStep({
  value,
  onChange,
  onNext,
  onSkip,
  onBack,
}: EnvironmentVariablesStepProps) {
  const [showValues, setShowValues] = React.useState<Record<number, boolean>>(
    {}
  );

  const handleAdd = () => {
    onChange([...value, { key: "", value: "" }]);
  };

  const handleRemove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleChange = (
    index: number,
    field: "key" | "value",
    newValue: string
  ) => {
    const updated = [...value];
    updated[index][field] = newValue;
    onChange(updated);
  };

  const toggleShowValue = (index: number) => {
    setShowValues((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const hasValidEnvVars = value.every((env) => env.key && env.value);
  const canContinue = value.length === 0 || hasValidEnvVars;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Environment Variables</h3>
        <p className="text-sm text-muted-foreground">
          Add environment variables for your project (optional)
        </p>
      </div>

      <Alert>
        <AlertDescription>
          Environment variables are encrypted and securely stored. You can add
          more later from the project settings.
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        {value.map((env, index) => (
          <div
            key={index}
            className="flex gap-2 items-start p-4 border rounded-lg bg-muted/20"
          >
            <div className="flex-1 space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`key-${index}`} className="text-xs">
                    Key
                  </Label>
                  <Input
                    id={`key-${index}`}
                    placeholder="API_KEY"
                    value={env.key}
                    onChange={(e) =>
                      handleChange(index, "key", e.target.value.toUpperCase())
                    }
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`value-${index}`} className="text-xs">
                    Value
                  </Label>
                  <div className="relative">
                    <Input
                      id={`value-${index}`}
                      type={showValues[index] ? "text" : "password"}
                      placeholder="your_secret_value"
                      value={env.value}
                      onChange={(e) =>
                        handleChange(index, "value", e.target.value)
                      }
                      className="font-mono text-sm pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowValue(index)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showValues[index] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => handleRemove(index)}
              className="mt-6"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="outline"
          onClick={handleAdd}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Environment Variable
        </Button>
      </div>

      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSkip}>
            Skip for Now
          </Button>
          <Button onClick={onNext} disabled={!canContinue}>
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
