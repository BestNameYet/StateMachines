try:
    from .mis_controller import MISController
    from .retrieval_adapter import RetrievalService, public_retrieve
    from .solver_kb_adapter import SolverKnowledgeAdapter
except ImportError:
    from mis_controller import MISController
    from retrieval_adapter import RetrievalService, public_retrieve
    from solver_kb_adapter import SolverKnowledgeAdapter

RETRIEVAL_SERVICE=RetrievalService(SolverKnowledgeAdapter())
CONTROLLER=MISController(RETRIEVAL_SERVICE,retrieval_limit=5)

def retrieve_context(query:str,limit:int=5)->dict: return public_retrieve(RETRIEVAL_SERVICE,query,limit)
def controller_start(desired_state:str)->dict: return CONTROLLER.start(desired_state)
def controller_respond(transaction_id:str,response:dict)->dict: return CONTROLLER.respond(transaction_id,response)
def controller_status(transaction_id:str)->dict: return CONTROLLER.status(transaction_id)
def controller_receipt(transaction_id:str)->dict: return CONTROLLER.receipt(transaction_id)
def controller_finalize(transaction_id:str,report:dict)->dict: return CONTROLLER.finalize(transaction_id,report)
