import { createClient } from '@supabase/supabase-js';
import { spawn } from 'child_process';

// Your Supabase project URL and public API key from the dashboard
const supabaseUrl = SUPABASE_URL;
const supabaseKey = SUPABASE_KEY;

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
