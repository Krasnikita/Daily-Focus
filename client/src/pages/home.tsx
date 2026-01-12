import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Send, CheckCircle, AlertCircle } from "lucide-react";

interface AgendaResult {
  calendarSection: string;
  miroSection: string;
  fullMessage: string;
  success: boolean;
  errors?: string[];
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgendaResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generateAgenda = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/generate-agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await response.json();
      
      if (!response.ok) {
        setError(data.error || "Failed to generate agenda");
        return;
      }

      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Daily Agenda Assistant</CardTitle>
          <CardDescription>
            Generate your daily agenda from Yandex Calendar and Miro board
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Button
            onClick={generateAgenda}
            disabled={loading}
            className="w-full"
            size="lg"
            data-testid="button-generate-agenda"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Generate Agenda & Send to Telegram
              </>
            )}
          </Button>

          {error && (
            <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg" data-testid="error-message">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">{error}</div>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2" data-testid="status-indicator">
                {result.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-sm font-medium text-green-600">Sent to Telegram successfully</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-5 w-5 text-amber-600" />
                    <span className="text-sm font-medium text-amber-600">Completed with warnings</span>
                  </>
                )}
              </div>

              {result.errors && result.errors.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg" data-testid="warnings-container">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">Warnings:</p>
                  <ul className="text-sm text-amber-700 dark:text-amber-300 list-disc list-inside">
                    {result.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="p-4 bg-muted rounded-lg" data-testid="message-preview">
                <p className="text-sm font-medium text-muted-foreground mb-2">Message sent:</p>
                <pre className="text-sm whitespace-pre-wrap font-mono">{result.fullMessage}</pre>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
