const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

// Prometheus and Supabase settings
const NODE_EXPORTER_URL = 'http://195.26.241.230:9100'; // Node Exporter URL
const HL_EXPORTER_URL = 'http://195.26.241.230:8086'; // HL Exporter URL
const SUPABASE_URL = 'https://divqlaaksyhfwouazjsf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpdnFsYWFrc3loZndvdWF6anNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyODc1MzY4NCwiZXhwIjoyMDQ0MzI5Njg0fQ.OfqRIUI1OI7b5HEFRT_gu0uHKKieu614XKZ8NiskqnM';


// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to query metrics from a given URL
async function queryMetrics(metricNames, exporterUrl) {
    try {
        const response = await axios.get(`${exporterUrl}/metrics`);
        const metrics = response.data;
        return extractMetrics(metrics, metricNames, exporterUrl);
    } catch (error) {
        console.error(`Error querying metrics from ${exporterUrl}:`, error);
        throw error;
    }
}

// Function to extract the required metrics
function extractMetrics(metrics, metricNames, exporterUrl) {
    const extractedMetrics = [];

    metricNames.forEach(metricName => {
        const metricLines = metrics.split('\n').filter(line => line.startsWith(metricName));
        metricLines.forEach(line => {
            const [key, value] = line.split(' ');
            extractedMetrics.push({
                metric_name: key,
                value: parseFloat(value),
                exporter: exporterUrl,  // Track the exporter the metric came from
                timestamp: new Date().toISOString() // Use current timestamp
            });
        });
    });

    return extractedMetrics;
}

// Function to insert data into Supabase
async function insertToSupabase(data) {
    try {
        const { data: insertedData, error } = await supabase
            .from('node_exporter-data')  // Replace with your table name
            .insert(data);

        if (error) {
            console.error('Error inserting data into Supabase:', error);
            throw error;
        }

        console.log('Data successfully inserted into Supabase:', insertedData);
    } catch (error) {
        console.error('Error inserting data:', error);
    }
}

// Main function to query and insert metrics into Supabase from both exporters
async function main() {
    try {
        // Define the expanded metrics you want to collect from both exporters
        const nodeMetricsToQuery = [
            'node_cpu_seconds_total',
            'node_memory_MemTotal_bytes',
            'node_memory_MemFree_bytes',
            'node_network_receive_bytes_total',
            'node_network_transmit_bytes_total',
            'node_disk_read_bytes_total',
            'node_disk_write_time_seconds_total',
            'node_load1',
            'node_load5',
            'node_load15',
            'node_forks_total',
            'node_vmstat_pgpgin',
            'node_vmstat_pgpgout'
        ];

        const hlMetricsToQuery = [
            'hl_apply_duration',
            'hl_block_height',
            'hl_jailed_stake',
            'hl_validator_count',
            'hl_validator_stake',
            'hl_validator_jailed_status',
            'hl_total_stake',
            'hl_not_jailed_stake',
            'hl_software_up_to_date'
        ];

        // Query both Node Exporter and HL Exporter
        const nodeExporterData = await queryMetrics(nodeMetricsToQuery, NODE_EXPORTER_URL);
        const hlExporterData = await queryMetrics(hlMetricsToQuery, HL_EXPORTER_URL);

        // Merge the data from both exporters
        const combinedData = [...nodeExporterData, ...hlExporterData];
        
        if (combinedData.length > 0) {
            await insertToSupabase(combinedData);
        }
    } catch (error) {
        console.error('Error during metrics collection and storage:', error);
    }
}

// Run the main function
main();
