import axios from 'axios';

async function getBlockHeaderState(block_num_or_id) {
  try {
    const shipHost = 'http://172.16.0.86:8891'; // replace with your host
    const response = await axios.post(`${shipHost}/v1/chain/get_block_header_state`, {
      block_num_or_id: String(block_num_or_id)
    });
    console.log(response.data);
  } catch (error) {
    console.error(error);
  }
}

getBlockHeaderState(260747629); // replace with your block number or ID