import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';

// Your Supabase project URL and public API key from the dashboard
const supabaseUrl = 'https://divqlaaksyhfwouazjsf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpdnFsYWFrc3loZndvdWF6anNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc1MzY4NCwiZXhwIjoyMDQ0MzI5Njg0fQ.OfqRIUI1OI7b5HEFRT_gu0uHKKieu614XKZ8NiskqnM';

// Create a Supabase client instance
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to insert HyperLiquid data into Supabase
async function insertData(logMessage) {
  try {
    const { data, error } = await supabase
      .from('validator-data')
      .insert([
        { log_message: logMessage }
      ]);

    if (error) {
      console.error('Error inserting data:', error);
      if (error.code === 'PGRST204') {
        console.error('Table schema issue detected. Please check if the "validator-data" table exists and has the correct columns.');
      }
    } else {
      console.log('Data inserted successfully:', data);
    }
  } catch (err) {
    console.error('Unexpected error during data insertion:', err);
  }
}

// Function to stream visor logs
function streamVisorLogs() {
  const visor = spawn('/root/hl-visor', ['run-non-validator']);

  visor.stdout.on('data', (data) => {
    const logMessage = data.toString().trim();
    console.log('Visor log:', logMessage);
    insertData(logMessage);
  });

  visor.stderr.on('data', (data) => {
    console.error('Visor error:', data.toString());
  });

  visor.on('close', (code) => {
    console.log(`Visor process exited with code ${code}`);
  });
}

// Start streaming visor logs
streamVisorLogs();
