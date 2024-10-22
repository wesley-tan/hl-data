from supabase import create_client, Client

# Initialize Supabase client
url = SUPABASE_URL
key = SUPABASE_KEY

supabase = create_client(url, key)

class Validator:
    def __init__(self, id, cpu_idle_time, cpu_iowait_time, cpu_irq_time):
        self.id = id
        self.cpu_idle_time = cpu_idle_time      # CPU idle time (proxy for uptime)
        self.cpu_iowait_time = cpu_iowait_time  # CPU I/O wait time (proxy for speed)
        self.cpu_irq_time = cpu_irq_time        # CPU IRQ time (proxy for errors/stress)
        self.overall_score = 0.0
        self.normalized_score = 0.0
        self.initial_delegation = 0.0
        self.adjusted_delegation = 0.0
        self.jailed = False

    def __str__(self):
        return f"Validator ID: {self.id}"

def normalize(value, min_val, max_val, invert=False):
    if max_val == min_val:
        return 1.0  # Avoid division by zero; assign maximum score
    else:
        normalized = (value - min_val) / (max_val - min_val)
        return 1.0 - normalized if invert else normalized

def calculate_validator_score(validator, min_idle, max_idle, min_iowait, max_iowait, min_irq, max_irq):
    # Idle time as uptime proxy - Higher idle = higher score
    idle_score = normalize(validator.cpu_idle_time, min_idle, max_idle, invert=False)

    # I/O wait time as speed proxy - Lower iowait = higher score
    iowait_score = normalize(validator.cpu_iowait_time, min_iowait, max_iowait, invert=True)

    # IRQ time as error/stress proxy - Lower irq = higher score
    irq_score = normalize(validator.cpu_irq_time, min_irq, max_irq, invert=True)

    # Overall score based on CPU metrics
    overall_score = (0.4 * idle_score) + (0.3 * iowait_score) + (0.3 * irq_score)

    return overall_score
    print(overall_score)
    # end overwrite file)

def fetch_validators_from_supabase():
    response = supabase.table('node_exporter-data').select('*').execute()
    
    if hasattr(response, 'error') and response.error:
        print(f"Error fetching data: {response.error}")
        return []
    
    # Extract the data
    validators = {}
    data = response.data if hasattr(response, 'data') else []
    for item in data:
        try:
            metric_name = item['metric_name']
            value = item['value']
            timestamp = item['timestamp']
            
            if metric_name.startswith('hl_validator_stake'):
                validator_id = metric_name.split('{')[1].split(',')[0].split('=')[1].strip('"')
                stake_value = float(value) if value is not None else 0.0
                
                # Update the validator's stake if it's more recent
                if validator_id not in validators or timestamp > validators[validator_id]['timestamp']:
                    validators[validator_id] = {
                        'id': validator_id,
                        'stake': stake_value,
                        'timestamp': timestamp,
                        'jailed': False  # We'll update this later if needed
                    }
            
            elif metric_name == 'hl_validator_jailed_status':
                validator_id = metric_name.split('{')[1].split(',')[0].split('=')[1].strip('"')
                jailed_status = value == 1
                
                # Update the validator's jailed status if it exists and is more recent
                if validator_id in validators and timestamp > validators[validator_id]['timestamp']:
                    validators[validator_id]['jailed'] = jailed_status
                    validators[validator_id]['timestamp'] = timestamp

        except (KeyError, ValueError) as e:
            print(f"Error processing data for validator: {e}")
            continue

    return list(validators.values())

def rebalance_delegations(validators, total_stake):
    # Step 1: Compute total stake of non-jailed validators
    total_non_jailed_stake = sum(v.stake for v in validators if not v.jailed)

    # Step 2: Calculate initial delegations based on stake and jailed status
    for validator in validators:
        if not validator.jailed:
            # For non-jailed validators, delegate proportionally to their stake
            validator.initial_delegation = (validator.stake / total_non_jailed_stake) * total_stake
        else:
            # For jailed validators, assign a minimal delegation (e.g., 10% of their proportional share)
            jailed_proportion = (validator.stake / total_non_jailed_stake) * 0.1
            validator.initial_delegation = jailed_proportion * total_stake

    # Step 3: Apply performance-based adjustments
    total_score = sum(v.overall_score for v in validators if not v.jailed)
    for validator in validators:
        if not validator.jailed:
            performance_factor = validator.overall_score / total_score
            validator.adjusted_delegation = validator.initial_delegation * (0.5 + 0.5 * performance_factor)
        else:
            validator.adjusted_delegation = validator.initial_delegation

    # Step 4: Normalize to ensure total delegation matches total_stake
    total_adjusted = sum(v.adjusted_delegation for v in validators)
    normalization_factor = total_stake / total_adjusted
    
    for validator in validators:
        validator.final_delegation = validator.adjusted_delegation * normalization_factor
        print(f"Validator {validator.id}: {validator.final_delegation:.2f} HYPR")

def main():
    # Fetch validators from Supabase
    validators_data = fetch_validators_from_supabase()
    validators = []

    if not validators_data:
        print("No data to process.")
        return

    for data in validators_data:
        validator = Validator(
            id=data['id'],
            cpu_idle_time=0,  # We don't have this data, so use a default value
            cpu_iowait_time=0,  # We don't have this data, so use a default value
            cpu_irq_time=0,  # We don't have this data, so use a default value
        )
        validator.stake = data['stake']
        validator.jailed = data['jailed']
        validators.append(validator)

    # Define min and max values for normalization (you may need to adjust these)
    min_idle, max_idle = 410000, 420000
    min_iowait, max_iowait = 18, 30
    min_irq, max_irq = 0, 2

    # Calculate scores for each validator
    for validator in validators:
        validator.overall_score = calculate_validator_score(
            validator, 
            min_idle, max_idle, 
            min_iowait, max_iowait, 
            min_irq, max_irq
        )
    
    # Rebalance based on the total stake (e.g., 1,000,000 HYPR)
    rebalance_delegations(validators, total_stake=1_000_000)

if __name__ == "__main__":
    main()
