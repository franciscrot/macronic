"""Explicit network setup; preparation itself uses local files only."""
import json,os
from .sources import ROOT
os.environ['HF_HUB_DISABLE_XET']='1'
from huggingface_hub import snapshot_download
for model,revision in json.loads((ROOT/'pipeline/models.json').read_text()).items():
    snapshot_download(model,revision=revision,allow_patterns=['*.json','*.txt','*.safetensors','1_Pooling/*','2_Dense/*'],ignore_patterns=['onnx/*','openvino/*'])
